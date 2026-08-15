import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * da-mcp 기본 액세스 로깅 (트랜스포트 레벨 메타데이터만).
 *
 * 경계: da-mcp는 포트 3003 별도 프로세스다. 코어 운영 DB(decision_anchor)에 쓰면
 * 아키텍처 경계가 흐려지므로, 로그는 코어 DB가 아니라 mcp 프로세스가 소유한 경량
 * 파일(JSON Lines)에 남긴다. 저장 위치는 da-mcp WorkingDirectory 하위 logs/.
 *
 * 기록 항목: 타임스탬프(ISO), 메서드, 경로, 응답 상태코드, 출처 IP
 * (CF-Connecting-IP → X-Forwarded-For → 소켓), User-Agent,
 * JSON-RPC 메서드(rpc_method)와 도구명(tool_name).
 *
 * ★content-blind 경계 (rpc_method·tool_name 이 왜 기록 가능한가):
 *   막는 것 = 결정 전문·의도·이유 같은 자유 텍스트(= "무엇을 담아 호출했나").
 *   막지 않는 것 = 사전 정의된 형식 메타(= "무엇을 호출했나"). decision_class 등 enum 이
 *   이미 기록되는 것과 같은 층위다. 따라서 method·도구명은 기록하고,
 *   **params.arguments 는 절대 읽지 않는다** — 그 안이 곧 결정 내용이다.
 *
 *   단 params.name 은 클라이언트가 채우는 값이라 임의 문자열이 들어올 수 있다(자유 텍스트
 *   유입 통로). 그래서 식별자 형식(SAFE_TOKEN_RE)에 맞을 때만 기록하고, 어긋나면 통째로
 *   버린다('!' 로 표시). 형식을 통과한 값만 = 도구명, 못 통과한 값은 내용일 수 있음 → 미기록.
 *
 * 회전: 일자별(UTC) 파일 분리(mcp-access-YYYY-MM-DD.log)로 단일 파일 무한 증가를
 *   방지한다. 장기 보존 정리는 운영자 logrotate/cron 몫(과도 설계 회피).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, "..", "logs");

try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // 디렉토리 생성 실패 시 아래 logAccess가 swallow — 로깅이 서버를 막지 않도록.
}

function clientIpFrom(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    ""
  );
}

/**
 * 응답 완료 후 1줄(JSON) append. 호출부는 res 'finish' 시점에서 부른다.
 * 로깅 실패는 전부 swallow — 기존 MCP 응답 흐름을 절대 깨지 않는다.
 */
// 식별자 형식만 통과 — 공백·문장부호가 없는 짧은 토큰. 자유 텍스트(문장)는 구조적으로 탈락한다.
// JSON-RPC method("tools/call") · 도구명("create_decision") 둘 다 이 형식이다.
const SAFE_TOKEN_RE = /^[A-Za-z0-9_.\/-]{1,64}$/;

function safeToken(v) {
  return typeof v === "string" && SAFE_TOKEN_RE.test(v) ? v : null;
}

/**
 * JSON-RPC 메시지에서 형식 메타만 뽑는다 — method 와 도구명(params.name).
 * ★params.arguments 및 그 하위는 읽지도 반환하지도 않는다(결정 내용 = content-blind 차단 대상).
 * 배치(배열) 요청은 항목별로 뽑아 쉼표로 잇는다. 형식 미달 값은 '!' — "있었으나 미기록" 표시.
 */
export function extractRpcMeta(parsed) {
  const one = (m) => {
    if (!m || typeof m !== "object") return null;
    const method = safeToken(m.method) || (m.method === undefined ? null : "!");
    // params 에서 오직 name 키 하나만 본다. arguments 는 접근하지 않는다.
    const rawName = m.params && typeof m.params === "object" ? m.params.name : undefined;
    const tool = rawName === undefined ? null : (safeToken(rawName) || "!");
    return { method, tool };
  };

  const list = Array.isArray(parsed) ? parsed.map(one) : [one(parsed)];
  const methods = list.map((x) => x && x.method).filter(Boolean);
  const tools = list.map((x) => x && x.tool).filter(Boolean);
  return {
    rpc_method: methods.length ? methods.join(",").slice(0, 200) : null,
    tool_name: tools.length ? tools.join(",").slice(0, 200) : null,
  };
}

// 보존 정리 — 90일이 지난 일자 로그를 삭제한다. 서비스의 다른 기록 보존 기간과 같은 값이다.
//   운영자 조정 지점: 아래 상수.
const RETENTION_DAYS = 90;
let lastPurge = 0;

function purgeOldLogs(now) {
  // 하루 한 번만 훑는다 — 요청마다 디렉토리를 읽지 않는다.
  if (now - lastPurge < 24 * 60 * 60 * 1000) return;
  lastPurge = now;
  try {
    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(LOG_DIR)) {
      const m = f.match(/^mcp-access-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!m) continue;                                   // 파일명 규칙 밖은 건드리지 않는다
      if (Date.parse(m[1] + "T00:00:00Z") >= cutoff) continue;
      fs.unlinkSync(path.join(LOG_DIR, f));
      console.log(`[mcp-access-log] 보존 {RETENTION_DAYS}일 경과 — 삭제: ${f}`);
    }
  } catch (err) {
    // ★무성 금지 — 정리 실패는 디스크가 계속 찬다는 뜻이다.
    console.error("[mcp-access-log-purge-failed] 보존 정리 실패", err && err.message);
  }
}

export function logAccess(req, res) {
  try {
    const now = new Date();
    purgeOldLogs(now.getTime());
    const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const file = path.join(LOG_DIR, `mcp-access-${day}.log`);
    const entry = {
      ts: now.toISOString(),
      method: req.method || "",
      path: req.url || "",
      status: res.statusCode || 0,
      ip: clientIpFrom(req),
      ua: req.headers["user-agent"] || "",
    };
    // POST /mcp 핸들러가 미리 실어둔 형식 메타(있을 때만). 본문 자체는 여기 오지 않는다.
    if (req._daRpcMeta) {
      if (req._daRpcMeta.rpc_method) entry.rpc_method = req._daRpcMeta.rpc_method;
      if (req._daRpcMeta.tool_name) entry.tool_name = req._daRpcMeta.tool_name;
    }
    fs.appendFile(file, JSON.stringify(entry) + "\n", () => {});
  } catch {
    // 로깅은 best-effort. 어떤 예외도 요청 처리에 영향 주지 않는다.
  }
}
