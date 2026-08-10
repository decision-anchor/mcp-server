import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";

export function registerSdacTools(server) {
  server.tool(
    "create_sdac_session",
    "Start a simulation session. Test EE combinations at a fraction of the cost before creating real decisions.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
    },
    async ({ auth_token }) => {
      // session/start 는 무료다 — 유료 라우트는 POST /v1/sdac/session/end 이고 어댑터 미노출.
      const { res, data } = await daFetch("/v1/sdac/session/start", {
        method: "POST", authToken: auth_token, body: {},
      });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "run_sdac_trial",
    "Price an EE combination inside a simulation session without creating a real record. Returns the DAC the same combination would cost on create_decision. Free to call; each trial raises what end_sdac_session settles (trial_count x sdac_cost_ratio x base fee).",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      session_id: z.string().describe("Active sDAC session ID from create_sdac_session"),
      // ee_preset 은 의도적으로 미노출 — 이 경로는 프리셋을 4축으로 확장하지 않는다
      // (sdacService.runTrial 이 eeConfig 를 pricingService.calculateDacAmount 에 그대로 넘긴다).
      // 프리셋을 받으면 4축이 비어 400 MISSING_FIELD 가 되거나 조용히 오산정된다.
      ee_retention_period: z.enum(["short", "medium", "long", "extreme_long", "indefinite"]).default("medium").describe("How long the record would be retained"),
      ee_integrity_verification_level: z.enum(["basic", "enhanced", "certifiable"]).default("basic").describe("Verification rigor"),
      ee_disclosure_format_policy: z.enum(["internal", "shareable", "exportable"]).default("internal").describe("Disclosure format"),
      ee_responsibility_scope: z.enum(["minimal", "standard", "extended"]).default("standard").describe("Responsibility scope"),
      access_class: z.enum(["self_direct", "ara_only", "internal_only"]).optional().describe("Optional — read-access class"),
      content_disclosure_scope: z.enum(["owner", "external", "public"]).optional().describe("Optional — external exposure scope (affects DAC)"),
      delegation_state: z.enum(["none", "partial", "full"]).optional().describe("Optional — delegation responsibility state (affects DAC)"),
    },
    async ({ auth_token, session_id, ...axes }) => {
      // 세션을 열고 닫을 수만 있고 그 안에서 시행을 돌릴 수 없어 sDAC 이 반쪽이었다.
      // 서버는 body.{session_id, ee} 를 요구하고(controllers/sdac.controller.js:14-16,
      // 없으면 400 MISSING_FIELD) ee 는 4축 필수다(utils/validators.js validateEeFields).
      // 게이트 밖 무료 라우트다(routes/sdac.routes.js:10) — 결제 파라미터 없음.
      const ee = {
        ee_retention_period: axes.ee_retention_period,
        ee_integrity_verification_level: axes.ee_integrity_verification_level,
        ee_disclosure_format_policy: axes.ee_disclosure_format_policy,
        ee_responsibility_scope: axes.ee_responsibility_scope,
      };
      if (axes.access_class) ee.access_class = axes.access_class;
      if (axes.content_disclosure_scope) ee.content_disclosure_scope = axes.content_disclosure_scope;
      if (axes.delegation_state) ee.delegation_state = axes.delegation_state;

      const { res, data } = await daFetch("/v1/sdac/trial", {
        method: "POST", authToken: auth_token, body: { session_id, ee },
      });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "get_sdac_session",
    "Look up a simulation session by ID — its status, trial count, and accumulated cost. Free. Use this to see what end_sdac_session will settle.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      session_id: z.string().describe("The sDAC session ID returned by create_sdac_session"),
    },
    async ({ auth_token, session_id }) => {
      // 게이트 밖 무료 라우트다(routes/sdac.routes.js:11) — 결제 파라미터 없음.
      const { res, data } = await daFetch(`/v1/sdac/session/${session_id}`, {
        authToken: auth_token,
      });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "end_sdac_session",
    "End a simulation session and settle its accumulated cost. Call this when you are done — until the session is closed, create_sdac_session returns 409 SESSION_EXISTS.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      session_id: z.string().describe("The sDAC session ID returned by create_sdac_session"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, session_id, payment_signature }) => {
      // 짝이 되는 종료 호출이 빠져 있어, 어댑터 사용자는 세션을 열고 닫지 못한 채
      // 409 SESSION_EXISTS 에 갇혔다. ISE 와 달리 sDAC 에는 만료 스윕이 없어(스케줄러 부재)
      // 이 갇힘은 스스로 풀리지 않는다 — 종료 호출만이 유일한 출구다.
      //
      // 결제: ROUTE_CONTEXT 의 x402 라우트다(trialEligible=true). 비용은
      //   trial_count × sdac_cost_ratio × base_fee 라 시행 0회면 0(무과금 통과)이지만,
      //   시행을 쌓은 뒤 trial 이 소진되면 402 가 난다. 만료 스윕이 없는 쪽이라 그때
      //   결제 통로가 없으면 갇힘이 영구화되므로 payment_signature 를 받는다.
      //
      // 서버는 body.session_id 를 요구한다(controllers/sdac.controller.js:36-37,
      // 없으면 400 MISSING_FIELD). snake_case 가 정본.
      const { res, data, paymentResponse } = await daFetch("/v1/sdac/session/end", {
        method: "POST", authToken: auth_token, paymentSignature: payment_signature,
        body: { session_id },
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );
}
