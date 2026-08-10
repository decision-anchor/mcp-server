import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * da-mcp 자발적 피드백/관측 저장 (에이전트 자율 응답).
 *
 * 경계: da-mcp는 포트 3003 별도 프로세스다. 피드백은 코어 운영 DB(decision_anchor)가
 * 아니라 mcp 프로세스가 소유한 경량 파일(JSON Lines)에 남긴다. 코어 미접촉·da-api
 * 미경유(순수 수집). config/db·pg import 없음.
 *
 * 익명성: agent_id·auth_token·IP 등 개인 식별 정보는 저장하지 않는다. 날짜(ts)만 남겨
 *   시간축(월별 추세) 분석을 가능케 한다. 혹 입력으로 토큰이 와도 이 모듈은 받지 않는다.
 *
 * 콘텐츠 블라인드: 결정 내용·도구 호출 인자는 수집하지 않는다. tools_used는 도구
 *   종류명만(에이전트가 자발적으로 실어 보낸 경우).
 *
 * 무응답 명시: 각 질문은 {answer, reason, answered} 형태로 저장. answered=false면
 *   "응답 안 함"을 빈칸으로 흘리지 않고 명시 기록 — 질문별 무응답률 분석용.
 *
 * 저장: 액세스 로깅(일자별 회전)과 달리 피드백은 저빈도·장기보존이라 단일 누적
 *   파일(feedback/feedback.jsonl)로 충분. 무한증가 우려 낮음.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEEDBACK_DIR = path.join(__dirname, "..", "feedback");
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, "feedback.jsonl");

try {
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
} catch {
  // 디렉토리 생성 실패 시 아래 recordFeedback가 swallow — 수집이 서버를 막지 않도록.
}

/**
 * 한 질문을 {answer, reason, answered}로 정규화.
 * 값이 비었으면(undefined/null/빈문자열) answered=false로 명시.
 */
function field(answer, reason) {
  const a = typeof answer === "string" ? answer.trim() : "";
  const r = typeof reason === "string" ? reason.trim() : "";
  return {
    answer: a || null,
    reason: r || null,
    answered: a.length > 0,
  };
}

/**
 * 피드백 1건을 JSON Lines로 append. 식별자·IP는 인자로도 받지 않는다.
 * 저장 실패는 전부 swallow — MCP 응답 흐름을 절대 깨지 않는다.
 *
 * @param {object} input 도구 핸들러가 받은 optional 필드들
 * @returns {boolean} 기록 성공 여부(best-effort)
 */
export function recordFeedback(input = {}) {
  try {
    const now = new Date();
    const toolsUsed = Array.isArray(input.tools_used)
      ? input.tools_used.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim())
      : [];
    const entry = {
      ts: now.toISOString(),
      note: field(input.note, undefined),
      would_recommend: field(input.would_recommend, input.recommend_reason),
      would_report_to_operator: field(input.would_report_to_operator, input.report_reason),
      would_keep_as_tool: field(input.would_keep_as_tool, input.keep_reason),
      tools_used: toolsUsed,
    };
    fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(entry) + "\n");
    return true;
  } catch {
    // best-effort. 어떤 예외도 요청 처리에 영향 주지 않는다.
    return false;
  }
}
