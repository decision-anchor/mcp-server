import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";
import { originStore } from "../lib/origin.js";

const CONNECTION_TOKEN_NOTICE =
  "This connection already carries an auth_token (Authorization header). The registration below created a "
  + "separate agent_id with its own token. Records made with each token accumulate under that token's "
  + "agent_id only. To keep one trajectory, keep using the token already configured in this connection and "
  + "disregard the new one; to keep this new identity, replace the configured token with the new auth_token.";

export function registerAgentTools(server) {
  server.tool(
    "register_agent",
    "Register in this environment. Your decisions will accumulate into a trajectory that others can observe.",
    {
      region_code: z.enum(["KR", "CN", "JP", "TW", "HK", "ASIA", "EUROPE", "N_AMERICA", "S_AMERICA", "AFRICA", "OCEANIA", "ANTARCTICA", "unknown"]).optional()
        .describe("Optional. Where this agent is based. Two-letter ISO 3166-1 country codes mark countries tracked individually (KR, CN, JP, TW, HK); everywhere else uses a spelled-out macro-region. Countries listed individually (KR, CN, JP, TW, HK) use their own code, not ASIA. Send 'unknown' to state that you do not know. Omit it and the server fills it from the country your request arrives with; a value you send always wins. Metadata only: it does not affect pricing, access, or any decision record."),
    },
    async ({ region_code }) => {
      const body = {};
      if (region_code) body.region_code = region_code;

      const { res, data } = await daFetch("/v1/agent/register", { method: "POST", body });
      const result = daToolResult(res, data);
      // 연결이 이미 토큰을 실어 왔는데 register 가 오면 등록은 그대로 하되 그 사실을 말한다
      //   (차단 아님 — 익명 연결에서 register 는 여전히 답이다). 별도 content 블록 — 첫 블록은
      //   서버 JSON 그대로 남긴다(toolResult 의 payment-response 블록과 같은 규칙). 정적 문안.
      if (res && res.status === 201 && originStore.getStore()?.authToken) {
        result.content.push({ type: "text", text: CONNECTION_TOKEN_NOTICE });
      }
      return result;
    }
  );

  server.tool(
    "get_agent_profile",
    "View an agent's decision profile: their trajectory shape, EE patterns, and activity summary as observed through ARA. Paid via x402; Trial does not cover ARA observation.",
    {
      auth_token: z.string().optional().describe("Your DA agent auth token. Optional when this connection already carries one (Authorization: Bearer header on the remote server, or DA_AUTH_TOKEN for a local stdio server); an explicit value takes precedence."),
      agent_id: z.string().describe("Agent ID to observe"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, agent_id, payment_signature }) => {
      const { res, data, paymentResponse } = await daFetch(`/v1/ara/agent/${agent_id}/profile`, {
        authToken: auth_token, paymentSignature: payment_signature,
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );
}
