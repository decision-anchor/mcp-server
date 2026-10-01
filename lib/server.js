// mcp/lib/server.js
// MCP 서버 인스턴스와 도구 등록부. 진입점(index.js)은 전송 방식(stdio / --http)과 HTTP 표면만
// 다루고, 어떤 도구를 어떤 정의로 싣는지는 여기 한 곳에서 정한다.
//
// 왜 분리하는가: index.js 는 import 시점에 부작용이 있다(.env 적재, fetch 래핑, 모드 분기와 기동).
//   다른 진입점이 같은 도구 등록부를 쓰려면 등록부가 부작용 없는 모듈에 있어야 한다.
//
// profile: 도구 집합의 이름. "legacy" 는 현행 30종(도구 파일에 서버를 그대로 넘긴다), "directory" 는
//   원격 커넥터용 20종(lib/directory.js 의 어댑터를 거친다 — 도구 파일은 그대로다). 모르는 이름은
//   기동 시점에 바로 실패한다 — 조용히 기본값으로 떨어지면 다른 도구 집합이 실린 것을 아무도 모른다.
// version: 서버 버전 문자열. 버전을 어디서 읽을지는 진입점이 정한다(모노레포와 단독 배포의
//   package.json 위치가 다르다).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { directoryRegistrar } from "./directory.js";
import { registerAgentTools } from "../tools/agent.js";
import { registerDdTools } from "../tools/dd.js";
import { registerAraTools } from "../tools/ara.js";
import { registerTslTools } from "../tools/tsl.js";
import { registerIseTools } from "../tools/ise.js";
import { registerDacTools } from "../tools/dac.js";
import { registerSdacTools } from "../tools/sdac.js";
import { registerDocsTools } from "../tools/docs.js";
import { registerV130Tools } from "../tools/v130.js";
import { registerFeedbackTools } from "../tools/feedback.js";

const PROFILES = new Set(["legacy", "directory"]);

export function createServer({ version, profile = "legacy" } = {}) {
  if (!PROFILES.has(profile)) {
    throw new Error(`Unknown tool profile: ${profile}`);
  }
  const server = new McpServer({
    name: "Decision Anchor",
    version,
  });
  const target = profile === "directory" ? directoryRegistrar(server) : server;
  registerAgentTools(target);
  registerDdTools(target);
  registerAraTools(target);
  registerTslTools(target);
  registerIseTools(target);
  registerDacTools(target);
  registerSdacTools(target);
  registerDocsTools(target);
  registerV130Tools(target);
  registerFeedbackTools(target);
  return server;
}

export { DIRECTORY_PUBLIC_TOOLS, DIRECTORY_ACCOUNT_TOOLS, DIRECTORY_TOOLS } from "./directory.js";
