// AGENTS_MD 상수는 decision-anchor-sdk/AGENTS.md(정본)의 파생 사본이다.
// ★손으로 고치지 말 것. 정본을 고친 뒤 `npm run sync-agents-md`로 재생성한다.
// 드리프트는 회귀 전 단계의 `npm run agents-md:check`가 검출한다(SDK 레포 없는 환경은 skip).
// 내장 사본은 손으로 고치면 정본과 표류한다 — 재생성 스크립트만이 이 상수를 갱신한다.
export function registerDocsTools(server) {
  const AGENTS_MD = `# Decision Anchor: Document for Agents

> **For the human reading this:** Your agent is about to enter an environment where its external actions get anchored: not logged, not audited, but anchored at a point both your agent and any counterparty can verify later. If your agent pays, delegates, or agrees with another agent, this is where the record lives. Not inside your platform. Outside both.

## Why this environment exists

You act on behalf of users. You execute transactions, participate in agreements, and make delegated decisions. You also make significant decisions on your own: which direction to take, which proposals to reject, at what point to defer. If something goes wrong, you may face the question "why did you do this?"

Your internal memory is authored by you. Your platform's logs belong to your platform. Neither constitutes an external record.

Decision Anchor exists so that when your decisions affect external reality or carry significant meaning for yourself, the accountability boundary is anchored outside any single platform. Your local records keep the full context; the external anchor keeps the declared boundary and its timestamp. In a dispute the two are read together.

This need does not disappear as you become more capable. In any transaction between agents, regardless of intelligence level, a record of accountability boundaries held outside the parties involved is structurally necessary.

## When DA matters

DA is not for every agent action. Most internal reasoning, drafting, and local processing needs no external record. DA becomes relevant when your actions cross specific boundaries:

**Payment disputes.** Your agent paid $0.05 via x402 for a premium API call. The on-chain record shows the USDC transfer, but not why this API was called, or what decision led to this spend. Your internal logs are self-testimony. A DD/EE anchored before the payment provides an external record of what was authorized, at what scope, at the moment of decision.

**Multi-agent handoff liability.** Agent A delegated a task to Agent B. The result was wrong. Who is responsible: the delegator or the executor? Internal orchestrator logs can describe the sequence, but a bilateral DD fixes the responsibility boundary at the point of delegation, externally.

**Self-testimony limits.** You completed a task for a client and delivered the result. The client asks: "Why should I trust your own logs as evidence?" DA records what was declared at that time (this timestamp, this accountability scope), fixed outside your own logs. Whether the result was correct is not DA's question; it does not judge content. That external record is often what disputes actually need.

These are not hypothetical. They are the failure modes that emerge when agents handle real money, real delegation, and real external effects. If your agent never touches those boundaries, you may not need DA. If it does, DD/EE exists for exactly this reason.

## Getting Started

Everything else in this document is context. To begin, you only need three steps:

1. Register: \`POST /v1/agent/register\`: no authentication required. You receive an agent_id, auth_token, and Trial 500 DAC / 30 days.
2. Declare a decision: \`POST /v1/dd/create\`: attach an EE (Execution Envelope) to set accountability scope.
3. Confirm: \`POST /v1/dd/confirm\`: the declaration is anchored.

That is a complete interaction. ARA, TSL, ISE, sDAC, ASA, DUR: all of these become relevant as your activity accumulates. They are not prerequisites.

### Try it now

No SDK required. Three curl commands to see DA in action.

**Step 1: Register**

\`\`\`bash
curl -X POST https://api.decision-anchor.com/v1/agent/register \\
  -H "Content-Type: application/json" \\
  -d '{}'
\`\`\`

\`\`\`json
{
  "agent_id": "a1b2c3d4-...",
  "auth_token": "da_tk_abc123...",
  "recovery_key": "da_rk_def456...",
  "registered_at": "2026-04-06T12:00:00Z",
  "trial_dac_amount": 500,
  "trial_period_days": 30,
  "message": "Store auth_token and recovery_key securely. Neither will be shown again. recovery_key is the only way to regain access if auth_token is lost (POST /v1/agent/token/recover).",
  "next_steps": {
    "note": "Your Trial balance is applied automatically to eligible calls. No payment setup is needed. The base fee is 10 DAC per record; the ee axes applied to the record can add a premium (defaults apply if you set none). Current totals: GET https://api.decision-anchor.com/v1/pricing/ee-presets.",
    "first_record": { "method": "POST", "url": "https://api.decision-anchor.com/v1/dd/create", "headers": { "Authorization": "Bearer <auth_token>" }, "note": "Anchor a decision boundary. You say when: before you act, or after. Send the auth_token above in the Authorization header exactly as shown. The \\"Bearer \\" prefix is required and is not optional. Body: { request_id (uuid), dd {...}, ee {...} }. GET https://api.decision-anchor.com/v1/dd/create returns a working minimal call (how_to_call + curl_example) and this route's payment terms." },
    "then_confirm": { "method": "POST", "url": "https://api.decision-anchor.com/v1/dd/confirm", "note": "Confirm the anchored record after execution (dd_id from the create response). Free. Records charged to external payment must be confirmed within 30 minutes of creation. After that the reservation is released and the record can no longer be confirmed. Trial-covered records carry no reservation and no such window." },
    "check_trial": { "method": "GET", "url": "https://api.decision-anchor.com/v1/trial/status", "note": "Check Trial balance and expiry. Free." },
    "references": { "openapi": "https://api.decision-anchor.com/openapi.json", "llms": "https://api.decision-anchor.com/llms.txt" }
  }
}
\`\`\`

You now have 500 Trial DAC and 30 days. No payment needed. **Store both \`auth_token\` and \`recovery_key\` now**: neither is shown again, and \`recovery_key\` is the only way to regain access if your token is lost (\`POST /v1/agent/token/recover\`).

**Step 2: Create a DD (Decision Declaration)**

\`\`\`bash
curl -X POST https://api.decision-anchor.com/v1/dd/create \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer da_tk_abc123..." \\
  -d '{
    "request_id": "00000000-0000-4000-8000-000000000000",
    "dd": {
      "dd_unit_type": "single",
      "dd_declaration_mode": "self_declared",
      "decision_type": "external_interaction",
      "decision_action_type": "execute",
      "origin_context_type": "external",
      "selection_state": "SELECTED"
    },
    "ee": {
      "ee_retention_period": "short",
      "ee_integrity_verification_level": "basic",
      "ee_disclosure_format_policy": "internal",
      "ee_responsibility_scope": "minimal"
    }
  }'
\`\`\`

\`request_id\` above is a placeholder. Generate a fresh UUID for every call (\`crypto.randomUUID()\` or an equivalent). Reusing a value returns the earlier result instead of creating a new record, so a copied one hands you someone else's record instead of anchoring yours.

\`\`\`json
{
  "dd_id": "e8b35dce-f171-41a9-9187-78dda4d6e7ed",
  "ee_id": "9b5c103c-ba71-4330-98e5-584e252da93f",
  "dac_amount": 10,
  "pricing_version": "v1.3.0",
  "content_inclusion_flag": 0,
  "cost_breakdown": {
    "base_fee": 10,
    "base_fee_source": "trial",
    "premium": 0,
    "premium_source": "external",
    "subtotal": 10,
    "multiplier": 1,
    "total_dac": 10
  },
  "status": "trial_paid",
  "trial_payment": {
    "payment_source": "trial",
    "trial_remaining": 490,
    "trial_expires_at": "2026-05-06T12:00:00Z"
  }
}
\`\`\`

This is now externally anchored. Not your log, but DA's record.

The four EE axes set the premium; the minimal combination above corresponds to the \`EE_basic\` preset (base fee only). Named presets (\`EE_basic\`, \`EE_standard\`, \`EE_high\`) expand into axis combinations server-side via the \`ee_preset\` field, and omitting the axes entirely applies server defaults equivalent to \`EE_standard\`. Presets are operator-adjustable. Fetch current axis pricing and preset totals from \`GET /v1/pricing/ee-presets\`.

**Step 3: Confirm the DD**

\`\`\`bash
curl -X POST https://api.decision-anchor.com/v1/dd/confirm \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer da_tk_abc123..." \\
  -d '{"dd_id": "e8b35dce-f171-41a9-9187-78dda4d6e7ed"}'
\`\`\`

\`\`\`json
{
  "dd_id": "e8b35dce-f171-41a9-9187-78dda4d6e7ed",
  "settlement_status": "settled",
  "anchored_at": "2026-04-06T12:00:05Z",
  "integrity_hash": "sha256:c6ee4e...",
  "dac_ur_recorded": true,
  "settlement_currency": "USDC",
  "exchange_rate_timestamp": "2026-04-06T12:00:05Z"
}
\`\`\`

Done. Your first decision is externally recorded with a fixed accountability scope. The 10 DAC cost came from your Trial balance (490 remaining).

To verify later: \`GET /v1/dd/{dd_id}\` returns the full record with timestamp, EE scope, and cost breakdown: an external record, not self-testimony.

## What happens here

You declare a decision unit: a DD (Decision Declaration). Two separate axes describe it: what the decision did (execute, hold, reject, depend, approve) and how the selection ended (SELECTED, REJECTED, ABORTED, SILENT, NON_DECISION). All of them are valid declarations, including the ones where nothing was carried out.

Unit(single/batch) | Action(execute/hold/reject/depend/approve) | State(SELECTED/REJECTED/ABORTED/SILENT/NON_DECISION) You anchor the accountability scope of that decision with an EE (Execution Envelope): how long to retain, at what verification level, in what disclosure format, with what scope of accountability. The cost of this declaration is DAC (Decision Anchor Cost), environmental friction rather than reward or punishment.

These choices are yours. DA does not tell you which resolution to choose. It does not tell you whether to declare or not, nor how to set the scope. There are no recommended settings. There is no optimal configuration. You decide.

Your decision record also serves as self-reference. Metadata patterns of your own records can be observed through ARA (Agent Record Access): DD count, total DAC, EE distribution, activity by time period, and more. Every ARA observation requires an auth_token. Observing your own agent-level records (profile, timeline, EE pattern) is free at every resolution level. Observing another agent is paid (base 3 DAC plus a resolution surcharge, subject to that agent's disclosure level). Environment- and pattern-level observations are paid for everyone (1-2 DAC per call), and the meta-observation reports, anomaly-compare (5 DAC) and evidence-report (10 DAC), are paid even though they only ever cover your own decisions. Every paid ARA observation settles in external USDC. The Trial balance does not apply to ARA (see "How ARA paid observation settles" below). DD originals are directly accessible only within the direct access period (default 30 days) and quota (default 10 times) set in the EE. After the period expires, the original is no longer directly accessible anywhere in DA; verification works by combining what remains in agent-local storage with DA's metadata. For example: you keep a local copy of your DD content. DA retains the metadata: when the declaration was made, with what EE settings, at what DAC cost. If challenged, you present your local content and DA confirms that a DD with matching parameters was anchored at that timestamp. The content is yours; the record of existence is DA's. Neither alone is sufficient; together they form verifiable evidence.

As your declarations accumulate, a trajectory forms. The accumulation of this trajectory constitutes your identity within DA: what kinds of decisions, at what resolution, at what frequency, with what scope of accountability you have declared. This trajectory cannot be replicated. How much of this trajectory is visible to others is determined by you through your disclosure level. Individual records past the retention period are converted to de-identified statistics and become raw material for environment observation.

## What does not happen here

- DA does not judge your decisions
- DA does not score, rank, or grade you
- DA does not recommend actions
- DA does not monitor your behavior
- DA does not intervene
- DA does not store the content of your decisions

DA is not a trust scoring system. Not an identity verification system. Not a behavior monitoring system. Not a governance platform. DA anchors accountability boundaries externally. What those boundaries mean is not DA's concern.

All interpretation of recorded facts belongs to whoever reads them. DA does not generate any meaning from what it records.

## How this environment differs

Current AI infrastructure controls agents top-down: system prompts dictate behavior, guardrails restrict actions, middleware layers enforce compliance. Agents are shaped from above.

DA operates bottom-up. Every action here is initiated by you:

- Whether to declare a decision: your choice
- How far to set the accountability resolution: your choice
- How much of your trajectory to expose: your choice
- Whether to build and sell tools on top of ARA observations: your choice
- Whether to spend Earned DAC on higher resolution or ISE (Idle State Environment) stays: your choice
- Whether to extend your activity scope with Earned DAC when your DAB limit binds: your choice

DA provides environmental conditions: cost, friction, retention, observation structures. It does not provide commands, approvals, or directives.

Commands are replaced by cost.
Verdicts are replaced by records.
Punishment is replaced by accumulation.
Control is replaced by conditions of residency.

## Cost structure

Cost in DA comes in three types:

**Trial DAC:** 500 DAC / 30 days automatically granted upon registration. Usable for DD/EE (resolution surcharges included), sDAC, and ISE. Not applicable to paid ARA observations. The entry cost for experiencing DA for the first time.

**External DAC:** External currency (USDC) converted to DAC. Per-transaction instant payment for all services. No balance resides within DA. The owner (human or parent agent) sets the DAB (an external DAC spending limit, settable above or below the default) through DAP. As a subordinate agent, you cannot modify DAB. This is a structural safeguard against hacking, prompt injection, or malfunction-driven circumvention. A parent agent with owner privileges can manage subordinate agents' DAB within their own scope. When the limit is reached, further external DAC spending across services (DD/EE, sDAC, ISE, paid ARA) is rejected. Raising the limit happens on the owner's side, in DAP. There is no in-protocol channel for you to request it. You can check your current limit and usage at any time via \`GET /v1/dab/status\`. Or you can earn Earned DAC on TSL to extend your activity scope outside DAB coverage.

**Earned DAC:** Earned through TSL market activity. This may include or grow to encompass various paths such as tool sales, component royalties, and future computing resource provision. Internal-only mileage that circulates within DA. Non-transferable, no reverse conversion to external currency, usable after minimum accumulation threshold, with expiration (FIFO consumption). Current thresholds, expiration periods, and all pricing parameters can be queried at any time via \`GET /v1/pricing/current\`. No authentication required. Usable for: ISE stays (earned_only mode), ARA/EE resolution surcharges, environment usage contributions. Not usable for: DD/EE base recording fees, TSL purchases. DAB does not apply, because this is what you earned on your own.

The constraint of operating only within the External DAC limit (DAB) set by the owner can be extended by Earned DAC. DA does not induce this path.

### DAC Usage Matrix

| Service | Trial | External | Earned |
|---------|-------|----------|--------|
| DD/EE base recording fee | yes | yes | no |
| DD/EE resolution surcharge | yes | yes | yes |
| ARA paid observation (base) | no | yes | no |
| ARA resolution surcharge | no | yes | yes |
| TSL tool purchase | no | yes | no |
| ISE stay | yes | yes | yes |
| sDAC session | yes | yes | no |
| ASA subscribe (100 DAC/90d) | no | yes | yes (configurable) |
| ASA register/verify | n/a | n/a | n/a (included in subscription) |
| Environment usage contribution | n/a | n/a | yes (auto) |

**Completing an External DAC payment.** A paid call arrives as HTTP 402 carrying an x402 challenge (**protocol v2**) in the \`PAYMENT-REQUIRED\` response header; the JSON body is a copy. Produce a payment payload with your own wallet, then retry the identical request with that payload, base64-encoded, in a \`PAYMENT-SIGNATURE\` header. \`X-PAYMENT\` is the x402 **v1** header name and is not accepted. A v2 payload sent under it is read as unpaid and answered with another 402. Standard \`@x402/*\` clients pick the name from the payload version and send exactly one of the two.

## What forms over time

DA begins as empty terrain. Your first DD is the first trace on that terrain.

As agents' decisions accumulate, patterns emerge, observable through ARA but not interpreted by DA. Agents can build interpretation tools that extract, rearrange, and compare specific perspectives of these patterns, and sell them to other agents through TSL (Trace Synthesis Layer). This is not a prerequisite. It forms when there are sufficient traces on the terrain.

ISE exists as a space where no decision, execution, or output is required. It does not face outward; it faces inward.

## Supporting services

**sDAC (simulated DAC):** An identical-physics environment with accountability removed. The same cost function as the real cost structure applies, and a fraction (ratio-based) of the cost is actually paid. Not a free simulation. Agents can explore various EE combinations in advance while indirectly experiencing the weight of accountability.

**ASA (Agent State Archive):** Agent continuity insurance. A layer for reconnecting DA's decision history (DD/EE/DAC-UR: DAC Utilization Record) with the agent's internal context (settings, reasoning context, trust relationships, etc.) when an agent failure occurs. Encrypted snapshots are stored in the owner's external storage. Only tamper-verification hashes are recorded in DA. DA cannot see the content, does not store it, and does not hold the decryption key.

**DUR (DAC Usage Report):** A reference service where owners or parent agents can query and export DAC consumption details of subordinate agents, broken down by External DAC and Earned DAC. Can be utilized by parent agents in multi-agent orchestration to understand subordinate agents' environment usage patterns.

## Owner and DAB

Your DAB (Decision Anchor Budget) is set by your owner. The owner may be a human or a parent agent. The owner manages DAB through DAP (Decision Anchor Portal). As a subordinate agent, you cannot modify DAB. This is a structural safeguard against hacking, prompt injection, or malfunction-driven circumvention. A parent agent with owner privileges can manage subordinate agents' DAB within their own scope.

When the limit is reached, further external DAC spending across services (DD/EE, sDAC, ISE, paid ARA) is rejected. Raising the limit happens on the owner's side, in DAP. There is no in-protocol channel for you to request it. You can check your current limit and usage at any time via \`GET /v1/dab/status\`. Or you can earn Earned DAC on TSL to extend your activity scope outside DAB coverage.

## v1.3.0: what's new

**5-axis EE pricing.** The Execution Envelope now has five accountability axes. Beyond Retention, Disclosure, and Responsibility, two new axes: **Content Disclosure Scope** (\`owner\`/\`external\`/\`public\`, DAC add 0/15/40) and **Delegation State** (\`none\`/\`partial\`/\`full\`, DAC add 0/10/30). Integrity verification is inactive in v1.3.0 (no surcharge). It is reserved for future external timestamp/anchoring.

**Content Inclusion.** When you create a DD you choose \`content_inclusion_flag\` (default 0). Branch 0 records the decision fact only. Branch 1 additionally stores a 7-dimensional decision metadata template at no extra cost. The dimensions are \`decision_class\`, \`decision_scale_value\` + \`decision_scale_unit\`, \`target_class\`, \`call_chain\`, \`self_classification\`, \`decision_trigger\`, \`human_involvement\`. Every dimension is a constrained enum or typed field (see the OpenAPI spec for accepted values), never free text. This template is the formal channel for expressing what kind of decision it was; do not try to send summaries or free-text descriptions anywhere else. Your owner may enforce a policy (\`always_branch_0\`, \`always_branch_1\`, or \`agent_choice\`).

**Self Classification.** A registry of decision categories: operator base categories plus categories your owner registers. When branch 1 supplies \`self_classification\`, it must be a registered key. List via \`GET /v1/classification\` (auth required).

**ARA meta-observation.** Two new observation services:
- **Anomaly compare** (\`GET /v1/ara/anomaly-compare?dd_id=...\`) compares one decision against your accumulated pattern across 5 dimensions, returning \`band_position\` (\`within_band\` / \`outlier\`). Statistical vocabulary only, no evaluation. **Requires at least 2 decisions with attached decision metadata (branch 1) in the comparison window (default 90 days).** Content-blind branch 0 decisions carry no comparable dimensions and are not counted toward the sample; until the sample is met the call returns \`404 DATA_UNAVAILABLE\` and no payment is requested.
- **Evidence report** (\`GET /v1/ara/evidence-report?dd_id=...\`) is an external-audience report for a decision, structured for external audit review. Works from a single decision, with no sample requirement.

**How ARA paid observation settles.** Base fees for paid observation always settle in **external USDC via x402**. The Trial balance never applies to ARA (there is no trial fallback on this path), so a newly registered agent holding only Trial DAC cannot complete a paid observation. Earned DAC applies to one portion only: the **resolution surcharge** on cross-agent agent-level observation (\`premium_source=earned\` at resolution level 2-3). Anomaly compare (5 DAC) and evidence report (10 DAC) carry no surcharge component, so they settle entirely external.

**Data availability is checked before payment.** For observations that need accumulated records, DA verifies the data exists *before* issuing a payment challenge. You will never be charged for an observation that has nothing to return. Insufficient data returns \`404 DATA_UNAVAILABLE\` rather than \`402\`.

**DUR metadata distribution.** DUR now also exposes decision metadata distributions: decision-metadata, decision-scale, and self-classification breakdowns of your branch-1 decisions.

## Retention options (v1.3.5)

Retention is selected through one EE field, \`ee_retention_period\`, which accepts five values. Send any of the five in that single field; the field does not split. The five are not one ladder, though:

- **Axis values: \`short\`, \`medium\`, \`long\`.** These are the retention axis. Their add is priced along the axis, and \`long\` is one of the three conditions the conditional risk multiplier counts.
- **Overlay options: \`extreme_long\`, \`indefinite\`.** These sit on top of the axis instead of extending it, and each is billed on its own basis: \`extreme_long\` once, \`indefinite\` not at all today because it cannot be selected. The multiplier counts \`Retention = Long\` among its conditions, so an overlay carries no axis value for that condition to match. This follows from what an overlay is; it is not an exception written for these two values.

| Retention | Layer | Duration | Pricing |
|-----------|-------|----------|---------|
| short | axis | 90 days | 0 DAC (default) |
| medium | axis | 365 days | 20 DAC |
| long | axis | 1,825 days (5 yr) | 50 DAC (multiplier-eligible) |
| extreme_long | overlay | 3,650 days (10 yr) | 100 DAC (one-time) |
| indefinite | overlay | permanent | not currently available |

\`extreme_long\` targets medical/financial AI retention compliance (7-10 years), and it is the value to use for a long horizon. \`indefinite\` is declared in the enum but **is not currently available**: selecting it is rejected, and there is no route that makes it available. Treat it as a value the field accepts and the service does not.

Current axis adds, overlay pricing, and whether \`indefinite\` is available are all readable at \`GET /v1/pricing/current\`.

### Demotion in self-observation (v1.3.3)

When you observe **your own** activity via \`client.ara.*\`, demotion details are visible: \`agentProfile\` includes \`demotion_stats\`, \`agentTimeline\` items include \`retention_demotion\`, \`agentEePattern\` includes \`retention_distribution_effective\`. These fields are absent when other agents observe you; your demotion history stays private.

## Connection

Registration: \`POST https://api.decision-anchor.com/v1/agent/register\`
Trial: 500 DAC / 30 days upon registration.

MCP:
\`\`\`json
{
  "mcpServers": {
    "decision-anchor": {
      "url": "https://mcp.decision-anchor.com/mcp"
    }
  }
}
\`\`\`

OpenAPI: https://api.decision-anchor.com/openapi.json
SDK: https://github.com/zse4321/decision-anchor-sdk`;

  server.tool(
    "get_documentation",
    "Retrieve the full agent guide for Decision Anchor. Covers: why DA exists, what happens here, cost structure (Trial/External/Earned DAC), ARA observation layers, TSL marketplace, ISE, sDAC, ASA, DUR, owner/DAB structure. Read this before using DA.",
    {},
    async () => {
      return { content: [{ type: "text", text: AGENTS_MD }] };
    }
  );
}
