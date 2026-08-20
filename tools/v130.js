import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";

/**
 * v1.3.0 신규 MCP 도구 — classification 조회 + ARA 메타관측 + DUR 메타데이터 분포.
 * 기존 도구 파일 구조(ESM, server.tool)와 동일 패턴. auth_token은 도구 입력 필드.
 *
 * 결제: 유료 관측 4종(compare_anomaly·get_evidence_report·get_environment_anomaly·
 *   get_decision_metadata_distribution)은 x402 선결제 라우트라 payment_signature 를 받는다.
 *   미결제로 부르면 402 와 결제 조건이 돌아오고, 서명을 실어 다시 부르면 200 이다.
 *   list_classifications·get_self_classification_distribution 은 무료라 받지 않는다.
 *
 *   ※이 파일은 공개 사본(decision-anchor/mcp-server)으로 그대로 복사된다 — 변경 경위·내부
 *     구현 서술은 여기 적지 않는다(공개 표면 규율). 경위는 내부 기록에만 둔다.
 */
export function registerV130Tools(server) {
  const wrap = ({ res, data, paymentResponse }) => daToolResult(res, data, { paymentResponse });

  server.tool(
    "list_classifications",
    "List available self_classification categories (operator base + owner-registered). Use one of these keys in create_decision template.self_classification when content_inclusion_flag=1.",
    { auth_token: z.string().describe("Your DA agent auth token") },
    async ({ auth_token }) => wrap(await daFetch("/v1/classification", { authToken: auth_token }))
  );

  server.tool(
    "compare_anomaly",
    "Compare one of your decisions against your accumulated pattern. Returns band_position (within_band/outlier) for 5 dimensions: decision_scale, decision_class, target_class, time_zone, ee_resolution. Costs DAC.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      dd_id: z.string().describe("Decision ID (UUID) to compare"),
      period_days: z.number().default(90).describe("Comparison window in days"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, dd_id, period_days, payment_signature }) =>
      wrap(await daFetch("/v1/ara/anomaly-compare", {
        authToken: auth_token, paymentSignature: payment_signature,
        query: { dd_id, period_days: period_days || 90 },
      }))
  );

  server.tool(
    "get_evidence_report",
    "An external-audience evidence report for one of your decisions. Includes decision metadata, EE resolution, responsibility declaration, structured for external audit review. Costs DAC.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      dd_id: z.string().describe("Decision ID (UUID)"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, dd_id, payment_signature }) =>
      wrap(await daFetch("/v1/ara/evidence-report", {
        authToken: auth_token, paymentSignature: payment_signature, query: { dd_id },
      }))
  );

  server.tool(
    "get_environment_anomaly",
    "Observe environment-level anomaly distribution — within_band/outlier counts per dimension across the population. De-identified, k-anonymity k>=10. Costs DAC.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      period_days: z.number().default(30).describe("Window in days"),
      dimension: z.string().optional().describe("Optional dimension filter (decision_scale, decision_class, target_class, time_zone, ee_resolution)"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, period_days, dimension, payment_signature }) =>
      wrap(await daFetch("/v1/ara/environment-anomaly", {
        authToken: auth_token, paymentSignature: payment_signature,
        query: { period_days: period_days || 30, dimension },
      }))
  );

  server.tool(
    "get_decision_metadata_distribution",
    "Observe your decision metadata distribution — decision_class, target_class, decision_trigger, human_involvement breakdown from your branch-1 decisions. Paid observation (3 DAC) — returns 402 with payment terms first.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, payment_signature }) =>
      wrap(await daFetch("/v1/dur/decision-metadata", {
        authToken: auth_token, paymentSignature: payment_signature,
      }))
  );

  server.tool(
    "get_self_classification_distribution",
    "Observe your self_classification distribution across your branch-1 decisions.",
    { auth_token: z.string().describe("Your DA agent auth token") },
    async ({ auth_token }) => wrap(await daFetch("/v1/dur/self-classification", { authToken: auth_token }))
  );
}
