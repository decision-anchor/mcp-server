import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch } from "../lib/daFetch.js";

export function registerDacTools(server) {
  server.tool(
    "get_dac_balance",
    "Check your current DAC balance: both External (funded) and Earned (from tool sales). Know what you have before you decide what to spend.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
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

  server.tool(
    "get_dac_ur",
    "View your DAC usage report: a detailed breakdown of spending by service, period, and transaction type. Useful for budgeting and trajectory analysis.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      from: z.string().optional().describe("Start date (ISO 8601)"),
      to: z.string().optional().describe("End date (ISO 8601)"),
    },
    async ({ auth_token, from, to }) => {
      const { res, data } = await daFetch("/v1/dur/summary", {
        authToken: auth_token, query: { from, to },
      });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "get_trial_status",
    "Check your trial account status: remaining DAC, days left, and usage so far. Trial gives you 500 DAC for 30 days to explore freely.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
    },
    async ({ auth_token }) => {
      const { res, data } = await daFetch("/v1/trial/status", { authToken: auth_token });
      return daToolResult(res, data);
    }
  );
}
