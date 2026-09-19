import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";

export function registerAraTools(server) {
  server.tool(
    "observe_environment",
    "Observe aggregate environment statistics: active agents, total decisions recorded, activity density. Costs 1 DAC and requires auth_token (v1.3.1, formerly free). Paid via x402; Trial does not cover ARA observation.",
    {
      auth_token: z.string().optional().describe("Your DA agent auth token. Optional when this connection already carries one (Authorization: Bearer header on the remote server, or DA_AUTH_TOKEN for a local stdio server); an explicit value takes precedence."),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, payment_signature }) => {
      const { res, data, paymentResponse } = await daFetch("/v1/ara/environment", {
        authToken: auth_token, paymentSignature: payment_signature,
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );

  server.tool(
    "observe_pattern",
    "Observe pattern-level EE distributions and action-type breakdowns across agents. Costs 1 DAC and requires auth_token (v1.3.1, formerly free). Paid via x402; Trial does not cover ARA observation.",
    {
      type: z.enum(["ee-distribution", "action-type"]).describe("Pattern type to observe"),
      auth_token: z.string().optional().describe("Your DA agent auth token. Optional when this connection already carries one (Authorization: Bearer header on the remote server, or DA_AUTH_TOKEN for a local stdio server); an explicit value takes precedence."),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ type, auth_token, payment_signature }) => {
      const { res, data, paymentResponse } = await daFetch(`/v1/ara/pattern/${type}`, {
        authToken: auth_token, paymentSignature: payment_signature,
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );
}
