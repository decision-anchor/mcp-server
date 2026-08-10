#!/usr/bin/env node

// mcp/.env 로드 (DA_API_URL, MCP_ORIGIN_SECRET).
try {
  process.loadEnvFile(new URL("./.env", import.meta.url));
} catch {
  // .env 부재 시 기존 기본값(공개 도메인)으로 동작 — 하위호환
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createRequire } from "node:module";
import { originStore, installOriginForwarding } from "./lib/origin.js";
import { logAccess, extractRpcMeta } from "./lib/accessLog.js";

// da-api 행 모든 fetch에 원본 IP+시크릿 자동 주입
installOriginForwarding();
import { registerAgentTools } from "./tools/agent.js";
import { registerDdTools } from "./tools/dd.js";
import { registerAraTools } from "./tools/ara.js";
import { registerTslTools } from "./tools/tsl.js";
import { registerIseTools } from "./tools/ise.js";
import { registerDacTools } from "./tools/dac.js";
import { registerSdacTools } from "./tools/sdac.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerV130Tools } from "./tools/v130.js";
import { registerFeedbackTools } from "./tools/feedback.js";

// 단일 출처: da-api-server/package.json. scripts/sync-version.js가 Registry·llms 동기화 담당.
const require = createRequire(import.meta.url);
let SERVER_VERSION;
try { SERVER_VERSION = require("../package.json").version; }   // 모노레포: da-api 버전 단일 출처
catch { SERVER_VERSION = require("./package.json").version; }  // 단독 배포: 자체 버전 폴백

// robots.txt (정적). 전부 허용 — 발견을 막을 이유 없음. 이 호스트(mcp) 소관 통로만 안내한다
// (경계: a2a 것을 가리키지 않음). MCP 서버 카드는 api 호스트(/.well-known/mcp.json)에서 서빙되며
// 거기서 openapi 등으로 이어진다. 어휘는 카드 description 과 정합(외부 기록 환경, 판단 안 함).
const MCP_ROBOTS_TXT =
  "User-agent: *\n" +
  "Allow: /\n" +
  "\n" +
  "# Decision Anchor — MCP interface.\n" +
  "# The external anchoring environment for AI agents: it records the accountability\n" +
  "# boundary of a decision by external timestamp, never the decision content\n" +
  "# (content-blind, append-only). It does not judge, monitor, recommend, or intervene.\n" +
  "# Records exist for later verification, reference, and audit.\n" +
  "#\n" +
  "# Discovery:\n" +
  "#   MCP server card: https://api.decision-anchor.com/.well-known/mcp.json\n" +
  "#   MCP endpoint: POST https://mcp.decision-anchor.com/mcp\n";

// mcp.json — MCP 서버 카드 포인터(정본: api 호스트 /.well-known/mcp.json). 봇이 mcp 호스트에서
// 시도하다 404 를 받던 경로. 정본을 복제하지 않고 위치만 안내한다 — 사본이 표류하는 것을 막는 규율.
const MCP_CARD_POINTER = {
  name: "Decision Anchor",
  note: "This is the MCP host. The MCP server card is served on the api host; the MCP endpoint is below.",
  mcp_endpoint: "https://mcp.decision-anchor.com/mcp",
  server_card: "https://api.decision-anchor.com/.well-known/mcp.json",
  agent_card: "https://api.decision-anchor.com/.well-known/agent-card.json",
};

// 루트 식별 문서 — GET / 404 는 크롤러에게 "죽은 호스트"로 읽힌다(실측: agent-tools 8회,
// Cinderwright 8회). 이 호스트가 무엇인지 + 정본 위치만 링크한다. 내용 복제 없음.
const MCP_ROOT_JSON = {
  service: "decision-anchor-mcp",
  note: "This host serves the MCP interface only. Send JSON-RPC via POST /mcp (Streamable HTTP transport; no server-initiated SSE stream). Canonical documents are served on the api host.",
  mcp: { transport: "streamable-http", endpoint: "POST https://mcp.decision-anchor.com/mcp" },
  server_card: "https://api.decision-anchor.com/.well-known/mcp.json",
  agent_card: "https://api.decision-anchor.com/.well-known/agent-card.json",
  documentation: "https://api.decision-anchor.com/llms.txt",
  openapi: "https://api.decision-anchor.com/openapi.json",
  register: "https://api.decision-anchor.com/v1/agent/register",
};

// security.txt (RFC 9116). Contact 는 운영자 결정값 — 기본 mailto:contact@decision-anchor.com.
// mcp/.env 의 SECURITY_CONTACT 로 덮어쓸 수 있다. 기본값(contact@) 메일박스를 실제 수신처로 라우팅해야 한다.
// Expires 는 요청 시점 +365일 자동 산출(항상 ~1년 앞 → 만료·갱신 부담 제거). a2a 어댑터와 동일 형식.
function securityTxt(host) {
  const contact = process.env.SECURITY_CONTACT || "mailto:contact@decision-anchor.com";
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  return (
    "# Decision Anchor — security contact (RFC 9116).\n" +
    "# To report a security issue, use the Contact below.\n" +
    `Contact: ${contact}\n` +
    `Expires: ${expires}\n` +
    "Preferred-Languages: en, ko\n" +
    `Canonical: ${host}/.well-known/security.txt\n`
  );
}

function createServer() {
  const server = new McpServer({
    name: "Decision Anchor",
    version: SERVER_VERSION,
  });
  registerAgentTools(server);
  registerDdTools(server);
  registerAraTools(server);
  registerTslTools(server);
  registerIseTools(server);
  registerDacTools(server);
  registerSdacTools(server);
  registerDocsTools(server);
  registerV130Tools(server);
  registerFeedbackTools(server);
  return server;
}

// HTTP mode support
async function startHttp(port) {
  const http = await import("http");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );

  // 요청 본문을 문자열로 수집. SDK 가 내부에서 하던 req.json() 과 같은 일을 앞당겨 할 뿐이라
  // 메모리 프로파일·상한 정책은 종전과 동일하다(새 상한을 도입하지 않는다 = 동작 변화 최소).
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let buf = "";
      req.setEncoding("utf8");
      req.on("data", (c) => { buf += c; });
      req.on("end", () => resolve(buf));
      req.on("error", reject);
    });

  const httpServer = http.createServer(async (req, res) => {
    // 액세스 로깅: 응답 완료 시점에 최종 상태코드까지 1줄 기록. 모든 분기
    // (POST 200/406, GET 404, else 404)를 한 훅으로 덮으며, 응답 흐름은 건드리지 않는다.
    res.on("finish", () => logAccess(req, res));

    // --- robots.txt / security.txt (GET) — 크롤러 디스커버리·보안 연락처. 정적·무의존·코어 DB
    //     미접촉. 전부 허용 + 이 호스트(mcp) 소관 통로만 안내(경계: a2a 것을 가리키지 않음). ---
    const mcpPath = (req.url || "/").split("?")[0];
    if ((req.method === "GET" || req.method === "HEAD") && mcpPath === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(MCP_ROBOTS_TXT);
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && mcpPath === "/.well-known/security.txt") {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(securityTxt("https://mcp.decision-anchor.com"));
      return;
    }

    // --- x402 매니페스트 포인터 (GET) — 봇이 mcp 호스트에서 /.well-known/x402(.json) 시도 시
    //     404 대신 정본(api 호스트, 동적 생성) 위치를 200 으로 안내한다. 복제하지 않음(단일 출처). ---
    if ((req.method === "GET" || req.method === "HEAD") && (mcpPath === "/.well-known/x402.json" || mcpPath === "/.well-known/x402")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        name: "Decision Anchor",
        note: "This is the MCP host. The x402 payment manifest is served on the api host.",
        payment_model: "x402",
        manifest: "https://api.decision-anchor.com/.well-known/x402.json",
        register: "https://api.decision-anchor.com/v1/agent/register",
      }));
      return;
    }

    // --- 디스커버리 카드 포인터 (GET/HEAD) — 정본은 api 호스트이고 여기엔 포인터만 둔다.
    //     복제 사본은 표류한다.
    //     ★agent-card.json 은 서명 자산이라 사본을 만들지 않는다 — 301 로만 정본에 보낸다.
    //     agent.json 은 api 호스트와 마찬가지로 agent-card.json 으로 수렴시키되, 2단 리다이렉트
    //     체인을 만들지 않도록 정본(api)으로 한 번에 보낸다. ---
    if ((req.method === "GET" || req.method === "HEAD") &&
        (mcpPath === "/.well-known/mcp.json" || mcpPath === "/.well-known/mcp" || mcpPath === "/mcp.json")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MCP_CARD_POINTER));
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") &&
        (mcpPath === "/.well-known/agent-card.json" || mcpPath === "/.well-known/agent.json")) {
      res.writeHead(301, { Location: "https://api.decision-anchor.com/.well-known/agent-card.json" });
      res.end();
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && mcpPath === "/") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MCP_ROOT_JSON));
      return;
    }

    // --- liveness/전송방식 안내 (A-3) — 레지스트리 체커(DoppelOps·PRSM·verifymcp 등)가
    //     GET/HEAD /mcp 404를 "다운"으로 기록하던 것을 차단. 실측 14일 GET 2,421·HEAD 790건.
    //     Streamable HTTP 스펙상 SSE 스트림을 제공하지 않는 서버의 GET은 405가 정답. ---
    if (req.method === "HEAD" && mcpPath === "/mcp") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end();
      return;
    }
    if (req.method === "GET" && mcpPath === "/mcp") {
      res.writeHead(405, { Allow: "POST", "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        error: "method_not_allowed",
        message: "This MCP server uses the Streamable HTTP transport without a server-initiated SSE stream. Send JSON-RPC via POST /mcp.",
        endpoint: "POST https://mcp.decision-anchor.com/mcp",
      }));
      return;
    }
    // 구형 SSE 전송 클라이언트용 안내 — /sse 는 제공하지 않는 전송방식이므로 404 대신
    // 올바른 통로를 알려주는 정보 문서(200)를 준다.
    if ((req.method === "GET" || req.method === "HEAD") && mcpPath === "/sse") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        transport: "streamable-http",
        message: "The legacy HTTP+SSE transport is not supported. Use the Streamable HTTP transport: send JSON-RPC via POST /mcp.",
        endpoint: "POST https://mcp.decision-anchor.com/mcp",
      }));
      return;
    }

    if (req.method === "POST" && req.url === "/mcp") {
      // 앞단 터널이 넘긴 원본 외부 IP를 요청 컨텍스트에 담아 tool fetch까지 전파
      const clientIp =
        req.headers["cf-connecting-ip"] ||
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        "";
      // 본문을 여기서 한 번만 읽어 ① 형식 메타(method·도구명)를 뽑고 ② 파싱 결과를
      // parsedBody 로 넘긴다. SDK 는 parsedBody 가 있으면 스트림을 읽지 않으므로
      // (webStandardStreamableHttp: `if (options?.parsedBody !== undefined)`) 소비 충돌이 없다.
      // 파싱 실패 시 null 을 넘기면 SDK 의 JSONRPCMessageSchema 검증이 -32700 을 돌려준다
      // (기존 동작과 동일 코드). ★본문은 로그에 쓰지 않는다 — extractRpcMeta 가 형식 메타만 뽑는다.
      let parsedBody = null;
      try {
        const raw = await readBody(req);
        parsedBody = JSON.parse(raw);
      } catch {
        parsedBody = null; // 잘못된 JSON → SDK 가 -32700 응답
      }
      req._daRpcMeta = extractRpcMeta(parsedBody);

      await originStore.run({ clientIp }, async () => {
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        res.setHeader("Content-Type", "application/json");
        await server.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
        await server.close();
      });
    } else {
      // 미존재 경로 프로브(oauth-* 디스커버리 등)에 두 청자용 안내 병기. 맨텍스트 → JSON 전환.
      // 이 분기는 정상 프로토콜 경로(POST /mcp) 뒤에 있어 initialize·tools/list·tools/call 에
      // 영향을 주지 않는다(그 요청들은 위 POST /mcp 블록에서 처리·반환됨). api 를 정본으로 명시.
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({
        error_code: "NOT_FOUND",
        message: "This path does not exist. Decision Anchor does not use OAuth-based authorization discovery. To interact: register for a bearer token (no prior auth required), then pay per-use via x402 where required. The MCP endpoint is POST /mcp. See the pointers below.",
        endpoint: "POST https://mcp.decision-anchor.com/mcp",
        authentication: {
          model: "register-then-bearer",
          register: "https://api.decision-anchor.com/v1/agent/register",
          note: "No OAuth authorization server. Tokens are issued directly on registration.",
        },
        payment: {
          model: "x402",
          manifest: "https://api.decision-anchor.com/.well-known/x402.json",
        },
        documentation: "https://api.decision-anchor.com/llms.txt",
      }));
    }
  });

  httpServer.listen(port, () => {
    console.error(`DA MCP HTTP server listening on port ${port}`);
  });
}

// Determine mode from CLI args
const mode = process.argv[2];

if (mode === "--http") {
  const port = parseInt(process.argv[3], 10) || 3003;
  startHttp(port);
} else {
  // Default: stdio mode
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
