import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch } from "../lib/daFetch.js";

export function registerDacTools(server) {
  server.registerTool(
    "get_dac_balance",
    {
      title: "Get DAC Balance",
      description: "Check your current DAC balances: the Earned DAC balance and the Trial status (remaining Trial DAC and days left). External payments are settled per call via x402 and are not held here as a balance.",
      annotations: { title: "Get DAC Balance", readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        auth_token: z.string().optional().describe("Your DA agent auth token. Optional when this connection already carries one (Authorization: Bearer header on the remote server, or DA_AUTH_TOKEN for a local stdio server); an explicit value takes precedence."),
      },
    },
    async ({ auth_token }) => {
      const [earned, trial] = await Promise.all([
        daFetch("/v1/earned-dac/balance", { authToken: auth_token }),
        daFetch("/v1/trial/status", { authToken: auth_token }),
      ]);
      const data = { earned_dac: earned.data, trial: trial.data };
      // 이중 fetch — 인증 상태는 두 응답이 동일 토큰을 쓰므로 하나로 대표(401 시 안내 부착).
      return daToolResult(!earned.res.ok ? earned.res : trial.res, data);
    }
  );

  server.registerTool(
    "get_dac_ur",
    {
      title: "Get DAC Usage Report",
      description: "View your DAC usage report: a detailed breakdown of spending by service, period, and transaction type. Useful for budgeting and trajectory analysis.",
      annotations: { title: "Get DAC Usage Report", readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        auth_token: z.string().optional().describe("Your DA agent auth token. Optional when this connection already carries one (Authorization: Bearer header on the remote server, or DA_AUTH_TOKEN for a local stdio server); an explicit value takes precedence."),
        from: z.string().optional().describe("Start date (ISO 8601)"),
        to: z.string().optional().describe("End date (ISO 8601)"),
      },
    },
    async ({ auth_token, from, to }) => {
      const { res, data } = await daFetch("/v1/dur/summary", {
        authToken: auth_token, query: { from, to },
      });
      return daToolResult(res, data);
    }
  );

  server.registerTool(
    "get_trial_status",
    {
      title: "Get Trial Status",
      description: "Check your trial account status: remaining DAC, days left, and usage so far. Trial gives you 500 DAC for 30 days to explore freely.",
      annotations: { title: "Get Trial Status", readOnlyHint: true, destructiveHint: false },
      inputSchema: {
        auth_token: z.string().optional().describe("Your DA agent auth token. Optional when this connection already carries one (Authorization: Bearer header on the remote server, or DA_AUTH_TOKEN for a local stdio server); an explicit value takes precedence."),
      },
    },
    async ({ auth_token }) => {
      const { res, data } = await daFetch("/v1/trial/status", { authToken: auth_token });
      return daToolResult(res, data);
    }
  );
}
