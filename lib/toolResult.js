// mcp/lib/toolResult.js
// 인증·유료 tool 응답을 MCP content 로 감싼다. 백엔드가 401(미등록)/402(미결제)를 반환할 때만
// LLM 에이전트용 자연어 안내를 덧붙인다.
//
// 배경(실측): MCP HTTP 계층은 무결제 호출에도 200 을 돌려주고 결제 챌린지 헤더를 싣지 않으므로,
// 스크립트 봇용 기계 402 는 이 표면에서 구조적으로 불가하다. 그러나 tool 결과 텍스트는 LLM 이
// 읽으므로, 401/402 일 때 정본(register·x402 매니페스트) 위치를 자연어로 안내한다.
//
// content-blind: 안내는 정적 문자열만이며 요청 인자·결정 내용을 절대 포함하지 않는다.
// 401/402 이외의 응답(200 성공·400·403·404 등)은 기존과 완전히 동일하게 통과시킨다.

const AUTH_HINT =
  "\n\n---\n" +
  "To use this tool: register for a bearer token at " +
  "https://api.decision-anchor.com/v1/agent/register (no prior authentication required), " +
  "then pay per-use via x402 where required. Payment manifest at " +
  "https://api.decision-anchor.com/.well-known/x402.json . " +
  "Decision Anchor does not use OAuth-based authorization. " +
  "Reference: https://api.decision-anchor.com/llms.txt";

// 402 전용. 종전에는 401 과 같은 문구를 써서 "결제가 필요하다"까지만 말하고 **어떻게 재시도하는지**는
// 말하지 않았다. 챌린지 본문은 이미 위에 실려 있으므로(서버가 402 body 에도 챌린지 사본을 싣는다)
// 여기서는 그 다음 수만 지시한다. 정적 문자열 — 요청 인자·금액·경로를 절대 삽입하지 않는다.
const PAYMENT_REQUIRED_HINT =
  "\n\n---\n" +
  "HTTP 402: the JSON above is an x402 payment challenge, not an error. To complete this " +
  "call: take accepts[0] from that challenge, build the matching x402 payment payload with " +
  "your own wallet (exact scheme, EIP-3009 USDC authorization on the stated network), " +
  "base64-encode it, and call this same tool again with every argument unchanged plus " +
  "payment_signature set to that value. The payload is bound to this exact resource and " +
  "amount, so the arguments must not change, and the challenge expires after the " +
  "maxTimeoutSeconds shown above. Decision Anchor never holds your key and never signs for " +
  "you. Some calls are covered by your Trial balance instead. Check " +
  "https://api.decision-anchor.com/v1/trial/status . " +
  "Payment manifest: https://api.decision-anchor.com/.well-known/x402.json";

/**
 * @param {Response} res
 * @param {any} data                  응답 본문 — 그대로 직렬화한다(어댑터가 형태를 바꾸지 않는다).
 * @param {object} [extra]
 * @param {string|null} [extra.paymentResponse] x402 정산 영수증 헤더값. 있으면 **별도 content
 *        블록**으로 덧붙인다. 첫 블록을 그대로 JSON 파싱할 수 있게 남겨두려는 것 — 본문에 섞으면
 *        어댑터가 서버 응답 스키마를 임의로 바꾸는 셈이 된다.
 */
export function daToolResult(res, data, extra = {}) {
  const text = JSON.stringify(data, null, 2);
  const status = res && res.status;

  let primary = text;
  if (status === 402) primary = text + PAYMENT_REQUIRED_HINT;
  else if (status === 401) primary = text + AUTH_HINT;

  const content = [{ type: "text", text: primary }];
  if (extra.paymentResponse) {
    content.push({ type: "text", text: `x402-payment-response: ${extra.paymentResponse}` });
  }
  return { content };
}
