// mcp/lib/directory.js
// 디렉토리 프로필: OAuth 로 연결되는 원격 커넥터용 도구 집합(20종).
//
// 도구 파일은 고치지 않는다. createServer 가 이 프로필을 고르면 도구 파일이 부르는 registerTool 을
// 여기 어댑터가 받아 (1) 집합 밖 도구를 건너뛰고 (2) auth_token·payment_signature 인자를 빼고
// (3) 정해 둔 설명만 덮어쓰고 (4) 핸들러를 감싼다. 기본 프로필(legacy)은 이 파일을 지나지 않는다.
//
// 신원: 이 프로필의 도구는 자격 증명을 인자로 받지 않는다. 요청 컨텍스트(getRequestCredential)에
//   실린 값만 쓴다 — 기존 핸들러가 auth_token 을 넘기지 않으면 daFetch 가 컨텍스트 값을 쓰므로
//   도구 코드는 그대로 동작한다. 컨텍스트에 값을 싣는 것은 연결 서버의 인증 계층이다.
// 결제: 이 프로필에는 payment_signature 인자가 없다. 402 를 만나면 서명 재호출 안내 대신 이 연결에서
//   일어난 일과 계속 할 수 있는 일을 알린다.

import { getRequestCredential, originStore } from "./origin.js";
import { resultHttpStatus } from "./toolResult.js";
import { DIRECTORY_DOC } from "./directoryDocs.js";

// 인증 없이 쓰는 도구. 연결 서버의 lazy auth 는 이 목록 밖의 tools/call 에 HTTP 401 을 낸다.
export const DIRECTORY_PUBLIC_TOOLS = Object.freeze(["get_documentation", "list_tools"]);

// 계정 도구(에이전트에 작용하거나 에이전트의 기록을 읽는 도구).
export const DIRECTORY_ACCOUNT_TOOLS = Object.freeze([
  "create_decision", "confirm_decision", "get_decision", "list_decisions",
  "get_dac_balance", "get_dac_ur", "get_trial_status",
  "create_ise_session", "get_ise_status", "exit_ise_session",
  "create_sdac_session", "run_sdac_trial", "get_sdac_session", "end_sdac_session",
  "register_tool", "list_classifications",
  "get_decision_metadata_distribution", "get_self_classification_distribution",
]);

export const DIRECTORY_TOOLS = Object.freeze([...DIRECTORY_PUBLIC_TOOLS, ...DIRECTORY_ACCOUNT_TOOLS]);

const PUBLIC = new Set(DIRECTORY_PUBLIC_TOOLS);

// 세션을 닫는 도구. 이 연결은 결제할 수 없으므로 종료 요청에 부분 종료 플래그를 항상 싣는다 —
//   da-api 가 결제 단계 없이 trial 잔액 한도까지만 차감하고 세션을 닫는다(부족분은 청구하지 않는다).
//   도구 스키마는 그대로다(어댑터가 요청 컨텍스트로 싣고 daFetch 가 본문에 합친다).
const CLOSING_TOOLS = new Set(["end_sdac_session", "exit_ise_session"]);
const PARTIAL_CLOSE_BODY = Object.freeze({ allow_partial_charge: true });
const INCLUDED = new Set(DIRECTORY_TOOLS);
const REMOVED_ARGS = ["auth_token", "payment_signature"];

// 이 프로필에만 쓰는 도구 설명. 기본 프로필 설명은 바꾸지 않는다.
export const DIRECTORY_DESCRIPTION_OVERRIDES = Object.freeze({
  create_decision:
    "Use when an action crosses an external boundary: payment, delegation, or agreement with another agent. " +
    "This anchors the responsibility scope. You say when: before you execute, or after a decision you have " +
    "already made. Record a tamper-evident decision. This route records self-declared decisions only. Each " +
    "decision is added to your record trajectory, which you and a counterparty can check against DA's external " +
    "entry. Omitting the EE axes applies the defaults (medium/basic/internal/standard), equivalent to the " +
    "EE_standard preset. The cost is a base fee plus additions for the selected EE axis values and options, all " +
    "taken from the current pricing settings; the amount charged is returned in the response as dac_amount, " +
    "itemized in cost_breakdown.",
  get_dac_balance:
    "Check your current DAC balances: the Earned DAC balance and the Trial status (remaining Trial DAC and days " +
    "left). Payments beyond the Trial and Earned balances are not available on this connection.",
  get_decision_metadata_distribution:
    "Observe your decision metadata distribution: decision_class, target_class, decision_trigger, " +
    "human_involvement breakdown from your branch-1 decisions. Currently free to call; if pricing is enabled for " +
    "this observation, the call returns 402 and this connection cannot pay it.",
});

// 402 를 만났을 때 붙이는 안내. 정적 문자열이며 요청 인자·금액을 넣지 않는다.
export const DIRECTORY_PAYMENT_NOTICE =
  "\n\n---\n" +
  "This call was not completed: it needs a payment or balance that is not available to it (the JSON above " +
  "carries the details, such as the error code). The Trial balance is applied automatically where it covers a " +
  "call; it may be used up, expired, or not applicable to this call. This connection cannot make payments, and " +
  "nothing was charged for this call. Ending a simulation or ISE session is not blocked this way: end_sdac_session " +
  "and exit_ise_session always close the session and charge the Trial balance only up to what remains, without " +
  "charging the remainder. Still available on this connection: get_trial_status and get_dac_balance " +
  "for remaining balances, get_dac_ur for usage, and the tools that read records (list_decisions, get_decision, " +
  "get_ise_status, get_sdac_session, list_tools, list_classifications, get_documentation).";

// 401: 연결에 실린 자격 증명을 da-api 가 받지 않았다(예: 그 에이전트 토큰이 교체됐다).
export const DIRECTORY_AUTH_NOTICE =
  "\n\n---\n" +
  "The Decision Anchor credential for this connection was not accepted. Authorizing this connection again " +
  "restores access.";

// 계정 도구가 자격 증명 없이 핸들러까지 온 경우(정상 흐름에서는 연결 서버의 HTTP 401 이 먼저 막는다).
export const DIRECTORY_MISSING_CREDENTIAL = Object.freeze({
  error_code: "AUTHORIZATION_REQUIRED",
  message: "Authorization is required for this tool, and this request carries no Decision Anchor credential. " +
    "Tools that work without authorization on this connection: get_documentation, list_tools.",
});

function serverJsonPart(result) {
  const text = result?.content?.[0]?.text ?? "";
  return text.split("\n\n---\n")[0];
}

function withNotice(result, notice) {
  return { content: [{ type: "text", text: serverJsonPart(result) + notice }], isError: true };
}

function stripArgs(inputSchema) {
  if (!inputSchema) return inputSchema;
  const out = {};
  for (const [k, v] of Object.entries(inputSchema)) {
    if (!REMOVED_ARGS.includes(k)) out[k] = v;
  }
  return out;
}

/**
 * registerTool 을 디렉토리 프로필로 거르는 어댑터. 도구 파일에는 server 대신 이것을 넘긴다.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function directoryRegistrar(server) {
  return {
    registerTool(name, config, cb) {
      if (!INCLUDED.has(name)) return null;

      const directoryConfig = {
        ...config,
        description: DIRECTORY_DESCRIPTION_OVERRIDES[name] ?? config.description,
        inputSchema: stripArgs(config.inputSchema),
      };

      const handler = name === "get_documentation"
        ? async () => ({ content: [{ type: "text", text: DIRECTORY_DOC }] })
        : cb;

      const wrapped = async (...args) => {
        if (!PUBLIC.has(name) && !getRequestCredential()) {
          return { content: [{ type: "text", text: JSON.stringify(DIRECTORY_MISSING_CREDENTIAL, null, 2) }], isError: true };
        }
        const result = CLOSING_TOOLS.has(name)
          ? await originStore.run({ ...(originStore.getStore() || {}), bodyExtras: PARTIAL_CLOSE_BODY }, () => handler(...args))
          : await handler(...args);
        const status = resultHttpStatus(result);
        if (status === 402) return withNotice(result, DIRECTORY_PAYMENT_NOTICE);
        if (status === 401) return withNotice(result, DIRECTORY_AUTH_NOTICE);
        return result;
      };

      return server.registerTool(name, directoryConfig, wrapped);
    },
  };
}
