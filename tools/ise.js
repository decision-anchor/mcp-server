import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";

export function registerIseTools(server) {
  server.tool(
    "create_ise_session",
    "Enter an interactive sandbox session. Test decision strategies before committing real DAC. Choose free, earned-only, or external billing.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      payment_mode: z.enum(["free", "earned_only", "external"]).default("free").describe("Billing mode for the session"),
    },
    async ({ auth_token, payment_mode }) => {
      // 서버는 snake_case payment_mode 를 읽는다. camelCase paymentMode 로 보내면 값이 조용히
      // 버려지고, 무엇을 지정하든 billing_mode 가 서버 기본값으로 떨어진다 — earned_only 를
      // 요청해도 응답이 free 로 나온다. 서버 계약의 표기가 정본이다.
      const { res, data, paymentResponse } = await daFetch("/v1/ise/enter", {
        method: "POST", authToken: auth_token, body: { payment_mode },
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );

  server.tool(
    "get_ise_status",
    "Check whether you have an active interactive sandbox session, and its elapsed time and billing mode. Free. Use this to find out what exit_ise_session will close.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
    },
    async ({ auth_token }) => {
      // 조회가 없으면 갇힌 사용자는 자기 세션이 있는지조차 확인할 수 없다.
      // 결제 게이트 밖의 무료 라우트다 — 결제 파라미터가 없다.
      const { res, data } = await daFetch("/v1/ise/status", { authToken: auth_token });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "exit_ise_session",
    "End your active interactive sandbox session and settle it. Call this when you are done — until the session is closed, create_ise_session returns 409 SESSION_EXISTS.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, payment_signature }) => {
      // 짝이 되는 종료 호출이 빠져 있어, 어댑터 사용자는 세션을 열고 닫지 못한 채
      // 409 SESSION_EXISTS 에 갇혔다(ISE 는 스케줄러가 maxMinutes 초과분을 강제 종료하므로
      // 결국 풀리지만, 그때까지는 새 세션을 못 연다).
      //
      // 결제: ROUTE_CONTEXT 의 x402 라우트다(trialEligible=true). free·earned_only 모드는
      //   calculateIsePrice 가 dac=0 을 돌려 게이트가 무과금 통과시키지만, external 모드가
      //   freeSeconds 를 넘긴 뒤 trial 까지 소진되면 402 가 난다. 그때 결제할 통로가 없으면
      //   종료 자체가 막혀 갇힘이 되돌아오므로 payment_signature 를 받는다.
      //
      // 서버는 본문을 읽지 않는다 — 에이전트·활성 세션을 auth 토큰으로 해석한다.
      const { res, data, paymentResponse } = await daFetch("/v1/ise/exit", {
        method: "POST", authToken: auth_token, paymentSignature: payment_signature, body: {},
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );
}
