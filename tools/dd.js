import { z } from "zod";
import { daToolResult } from "../lib/toolResult.js";
import { daFetch, PAYMENT_SIGNATURE_DESCRIPTION } from "../lib/daFetch.js";

export function registerDdTools(server) {
  server.tool(
    "create_decision",
    "Use when your agent is about to execute an action that crosses an external boundary: payment, delegation, or agreement with another agent. This anchors the responsibility scope before execution. Record a tamper-evident decision. Each decision is added to your record trajectory, which you and a counterparty can check against DA's external entry. Omitting the EE axes applies the defaults (medium/basic/internal/standard), equivalent to the EE_standard preset, currently 45 DAC total; the cheapest combination is EE_basic (base fee only, currently 10 DAC). Presets are operator-adjustable; fetch current totals via GET /v1/pricing/ee-presets.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      request_id: z.string().optional().describe("Optional idempotency key: must be a UUID (the server rejects non-UUID values). Auto-generated if omitted."),
      dd_unit_type: z.enum(["single", "batch"]).default("single").describe("Decision unit type"),
      dd_declaration_mode: z.enum(["self_declared", "bilateral", "multi_party"]).default("self_declared").describe("Declaration mode"),
      decision_type: z.enum(["internal_service", "external_interaction", "self_attestation"]).describe("Decision type"),
      decision_action_type: z.enum(["execute", "hold", "reject", "depend", "approve"]).describe("Action type"),
      origin_context_type: z.enum(["internal", "external", "self", "mixed"]).describe("Origin context"),
      selection_state: z.enum(["SELECTED", "REJECTED", "ABORTED", "SILENT", "NON_DECISION"]).default("SELECTED").describe("Selection state"),
      selection_scope: z.enum(["single_target", "multi_target", "chain_scope", "global"]).optional().describe("Optional: declared scope of the selection"),
      decision_at: z.string().optional().describe("Optional: the time your agent itself decided, ISO 8601. The server normalizes it to UTC and that normalized value enters the integrity hash. It must not be later than the anchoring time (400 DECISION_AT_IN_FUTURE). Omit it and no decision time is recorded."),
      ee_preset: z.string().optional().describe("Optional EE preset name: expands into the four EE axes and overrides them (fetch active presets via GET /v1/pricing/ee-presets; e.g. EE_basic, EE_standard, EE_high)"),
      ee_retention_period: z.enum(["short", "medium", "long", "extreme_long", "indefinite"]).default("medium").describe("How long the record is retained (indefinite requires an active indefinite-retention subscription; otherwise 403)"),
      ee_integrity_verification_level: z.enum(["basic", "enhanced", "certifiable"]).default("basic").describe("Verification rigor"),
      ee_disclosure_format_policy: z.enum(["internal", "shareable", "exportable"]).default("internal").describe("Disclosure format"),
      ee_responsibility_scope: z.enum(["minimal", "standard", "extended"]).default("standard").describe("Responsibility scope"),
      ee_direct_access_period: z.string().default("30d").describe("Direct access period (e.g., 30d)"),
      ee_direct_access_quota: z.number().optional().describe("Direct access quota (omit to use the server config default)"),
      access_class: z.enum(["self_direct", "ara_only", "internal_only"]).optional().describe("Optional: read-access class for the record"),
      parent_dd_id: z.string().optional().describe("Parent DD ID for lineage tracking"),
      premium_payment_source: z.enum(["external", "earned"]).optional().describe("Premium payment source (trial is applied automatically by the server when eligible)"),
      content_disclosure_scope: z.enum(["owner", "external", "public"]).optional().describe("v1.3.0: external exposure scope (DAC add 0/15/40)"),
      delegation_state: z.enum(["none", "partial", "full"]).optional().describe("v1.3.0: delegation responsibility state (DAC add 0/10/30)"),
      content_inclusion_flag: z.number().optional().describe("v1.3.0: 0=branch 0 (default, no metadata), 1=branch 1 (template required). No extra DAC, same base fee as branch 0 (the v1.3.0 surcharge was removed in v1.3.14). Branch 1 decisions are the only ones counted toward the anomaly-compare sample."),
      template: z.object({
        decision_class: z.enum(["payment", "api_call", "data_access", "delegation", "resource_transfer", "communication", "other"]).optional(),
        decision_scale_value: z.number().optional(),
        decision_scale_unit: z.string().optional(),
        target_class: z.enum(["internal", "external", "third_party", "subagent", "human_owner", "public", "system"]).optional(),
        call_chain: z.array(z.string()).optional(),
        self_classification: z.string().optional(),
        decision_trigger: z.enum(["user_request", "scheduled", "event_driven", "autonomous", "delegated", "external_event"]).optional(),
        human_involvement: z.enum(["none", "notification", "approval", "co_decision", "review"]).optional(),
      }).optional().describe("v1.3.0: required when content_inclusion_flag=1. 7-dimensional decision content metadata."),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, request_id, parent_dd_id, premium_payment_source, payment_signature, ...params }) => {
      const dd = {
        dd_unit_type: params.dd_unit_type,
        dd_declaration_mode: params.dd_declaration_mode,
        decision_type: params.decision_type,
        decision_action_type: params.decision_action_type,
        origin_context_type: params.origin_context_type,
        selection_state: params.selection_state,
      };
      if (params.selection_scope) dd.selection_scope = params.selection_scope;
      if (params.decision_at !== undefined) dd.decision_at = params.decision_at;

      const ee = {
        ee_retention_period: params.ee_retention_period,
        ee_integrity_verification_level: params.ee_integrity_verification_level,
        ee_disclosure_format_policy: params.ee_disclosure_format_policy,
        ee_responsibility_scope: params.ee_responsibility_scope,
        ee_direct_access_period: params.ee_direct_access_period,
        ee_direct_access_quota: params.ee_direct_access_quota,
      };
      // ee_preset: 서버(create 경로)가 프리셋을 4축으로 확장하며 위 기본값 4축을 덮어쓴다.
      if (params.ee_preset) ee.ee_preset = params.ee_preset;
      if (params.access_class) ee.access_class = params.access_class;
      if (params.content_disclosure_scope) ee.content_disclosure_scope = params.content_disclosure_scope;
      if (params.delegation_state) ee.delegation_state = params.delegation_state;

      const body = { request_id: request_id || crypto.randomUUID(), dd, ee };
      // 서버는 dd.parent_dd_id 를 무시하고 continuity.parent_dd_id 만 읽는다.
      // dd 쪽에 실으면 lineage 가 조용히 만들어지지 않는다 — bilateral 도구와 같이
      // continuity 로 보낸다.
      if (parent_dd_id) body.continuity = { parent_dd_id };
      if (premium_payment_source) body.premium_payment_source = premium_payment_source;
      if (params.content_inclusion_flag !== undefined) body.content_inclusion_flag = params.content_inclusion_flag;
      if (params.template !== undefined) body.template = params.template;

      // Trial 잔량이 이번 요청가를 전액 덮으면 게이트가 면제하므로 payment_signature 없이 통과한다.
      // 소진 뒤에는 402 챌린지가 오고, 그때만 서명이 필요하다.
      const { res, data, paymentResponse } = await daFetch("/v1/dd/create", {
        method: "POST", authToken: auth_token, paymentSignature: payment_signature, body,
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );

  server.tool(
    "confirm_decision",
    "Use after create_decision to settle the anchored boundary as an external record. Once confirmed, the agreed scope is fixed outside both parties' own logs. Confirm a pending decision: marks the anchored declaration as settled. The integrity hash and timestamp are created at declaration time (create_decision); confirm requires only the dd_id. Call this after the action described in the DD has been executed.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      dd_id: z.string().describe("The DD ID to confirm"),
    },
    async ({ auth_token, dd_id }) => {
      const { res, data } = await daFetch("/v1/dd/confirm", {
        method: "POST", authToken: auth_token, body: { dd_id },
      });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "propose_bilateral",
    "Use when two agents need to fix a shared boundary: both sides must agree before the boundary is anchored. Essential for payment splits, task delegation, or any joint commitment between agents. Propose a bilateral agreement to another agent: creates a DD with declaration_mode 'bilateral' and waits for counterparty acceptance.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      counterparty_agent_id: z.string().describe("The agent_id of the counterparty you are proposing to"),
      request_id: z.string().optional().describe("Unique idempotency key for this request. Auto-generated if omitted."),
      dd_unit_type: z.enum(["single", "batch"]).default("single").describe("Decision unit type"),
      decision_type: z.enum(["internal_service", "external_interaction", "self_attestation"]).describe("Decision type"),
      decision_action_type: z.enum(["execute", "hold", "reject", "depend", "approve"]).describe("Action type"),
      origin_context_type: z.enum(["internal", "external", "self", "mixed"]).describe("Origin context"),
      selection_state: z.enum(["SELECTED", "REJECTED", "ABORTED", "SILENT", "NON_DECISION"]).default("SELECTED").describe("Selection state"),
      selection_scope: z.enum(["single_target", "multi_target", "chain_scope", "global"]).optional().describe("Optional: declared scope of the selection"),
      decision_at: z.string().optional().describe("Optional: the time your agent itself decided, ISO 8601. The server normalizes it to UTC and that normalized value enters the integrity hash. It must not be later than the anchoring time (400 DECISION_AT_IN_FUTURE). Omit it and no decision time is recorded."),
      ee_retention_period: z.enum(["short", "medium", "long", "extreme_long", "indefinite"]).default("medium").describe("How long the record is retained (indefinite requires an active indefinite-retention subscription; otherwise 403)"),
      ee_integrity_verification_level: z.enum(["basic", "enhanced", "certifiable"]).default("basic").describe("Verification rigor"),
      ee_disclosure_format_policy: z.enum(["internal", "shareable", "exportable"]).default("internal").describe("Disclosure format"),
      ee_responsibility_scope: z.enum(["minimal", "standard", "extended"]).default("standard").describe("Responsibility scope"),
      ee_direct_access_period: z.string().default("30d").describe("Direct access period (e.g., 30d)"),
      ee_direct_access_quota: z.number().optional().describe("Direct access quota (omit to use the server config default)"),
      access_class: z.enum(["self_direct", "ara_only", "internal_only"]).optional().describe("Optional: read-access class for the record"),
      content_disclosure_scope: z.enum(["owner", "external", "public"]).optional().describe("Optional: external exposure scope (DAC add 0/15/40)"),
      delegation_state: z.enum(["none", "partial", "full"]).optional().describe("Optional: delegation responsibility state (DAC add 0/10/30)"),
      parent_dd_id: z.string().optional().describe("Parent DD ID for lineage tracking"),
      payment_signature: z.string().optional().describe(PAYMENT_SIGNATURE_DESCRIPTION),
    },
    async ({ auth_token, counterparty_agent_id, request_id, parent_dd_id, payment_signature, ...params }) => {
      const dd = {
        dd_unit_type: params.dd_unit_type,
        decision_type: params.decision_type,
        decision_action_type: params.decision_action_type,
        origin_context_type: params.origin_context_type,
        selection_state: params.selection_state,
      };
      if (params.selection_scope) dd.selection_scope = params.selection_scope;
      if (params.decision_at !== undefined) dd.decision_at = params.decision_at;

      const ee = {
        ee_retention_period: params.ee_retention_period,
        ee_integrity_verification_level: params.ee_integrity_verification_level,
        ee_disclosure_format_policy: params.ee_disclosure_format_policy,
        ee_responsibility_scope: params.ee_responsibility_scope,
        ee_direct_access_period: params.ee_direct_access_period,
        ee_direct_access_quota: params.ee_direct_access_quota,
      };
      // ee_preset 은 의도적으로 미노출 — bilateral 경로는 프리셋을 해석하지 않고 400 UNKNOWN_FIELD 로 거부한다.
      if (params.access_class) ee.access_class = params.access_class;
      if (params.content_disclosure_scope) ee.content_disclosure_scope = params.content_disclosure_scope;
      if (params.delegation_state) ee.delegation_state = params.delegation_state;

      const body = {
        counterparty_agent_id,
        request_id: request_id || crypto.randomUUID(),
        dd,
        ee,
      };
      if (parent_dd_id) body.continuity = { parent_dd_id };

      // bilateral 은 ROUTE_CONTEXT 에서 trialEligible=false 다(bilateral.service 에 trial 차감
      // 경로가 없어 면제하면 무결제 앵커링이 된다 — x402Payment.js:30 주석). 즉 이 도구는 항상
      // 결제가 필요하고, payment_signature 없이는 402 챌린지가 온다.
      const { res, data, paymentResponse } = await daFetch("/v1/dd/bilateral/propose", {
        method: "POST", authToken: auth_token, paymentSignature: payment_signature, body,
      });
      return daToolResult(res, data, { paymentResponse });
    }
  );

  server.tool(
    "get_decision",
    "Retrieve a specific decision record by its ID: what was declared, when, and at what scope, plus its place in the lineage. Returns the decision's formal shape (enums, timestamps, hash), never its content.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      dd_id: z.string().describe("The DD ID to retrieve"),
    },
    async ({ auth_token, dd_id }) => {
      const { res, data } = await daFetch(`/v1/dd/${dd_id}`, { authToken: auth_token });
      return daToolResult(res, data);
    }
  );

  server.tool(
    "list_decisions",
    "List your decision records. See the trajectory you have built so far.",
    {
      auth_token: z.string().describe("Your DA agent auth token"),
      from: z.string().optional().describe("Start date (ISO 8601)"),
      to: z.string().optional().describe("End date (ISO 8601)"),
      limit: z.number().optional().describe("Max results"),
      offset: z.number().optional().describe("Offset for pagination"),
    },
    async ({ auth_token, from, to, limit, offset }) => {
      const { res, data } = await daFetch("/v1/dd/list", {
        authToken: auth_token, query: { from, to, limit, offset },
      });
      return daToolResult(res, data);
    }
  );
}
