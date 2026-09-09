import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";

export function registerAgentTools(server) {
  server.tool(
    "register_agent",
    "Register in this environment. Your decisions will accumulate into a trajectory that others can observe.",
    {
      region_code: z.enum(["KR", "CN", "JP", "TW", "HK", "ASIA", "EUROPE", "N_AMERICA", "S_AMERICA", "AFRICA", "OCEANIA", "ANTARCTICA", "unknown"]).optional()
        .describe("Optional. Where this agent is based. Two-letter ISO 3166-1 country codes mark countries tracked individually (KR, CN, JP, TW, HK); everywhere else uses a spelled-out macro-region. Countries listed individually (KR, CN, JP, TW, HK) use their own code, not ASIA. Send 'unknown' to state that you do not know. Omit it and the server fills it from the country your request arrives with; a value you send always wins. Metadata only: it does not affect pricing, access, or any decision record."),
      is_test: z.boolean().default(false).describe("Mark as test agent for cleanup via Admin API"),
    },
    async ({ region_code, is_test }) => {
      const body = {};
      if (region_code) body.region_code = region_code;
      if (is_test) body.is_test = true;

      const { res, data } = await daFetch("/v1/agent/register", { method: "POST", body });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "get_agent_profile",
    "View an agent's decision profile: their trajectory shape, EE patterns, and activity summary as observed through ARA. Paid via x402; Trial does not cover ARA observation.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
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
