// mcp/lib/directoryDocs.js
// get_documentation 의 디렉토리판 본문. 디렉토리 프로필(OAuth 로 연결되는 원격 커넥터)에서만 쓴다.
// 기본판(tools/docs.js 의 AGENTS_MD)과 달리 이 연결에서 쓸 수 있는 도구와 그 쓰임, 비용이 응답에
// 나타나는 자리, trial 과 그 소진 시 동작만 담는다. 등록·토큰 발급 절차와 결제 절차는 싣지 않는다
// (이 연결에서는 둘 다 일어나지 않는다). 값이 바뀌는 설정 숫자도 적지 않는다.

export const DIRECTORY_DOC = `# Decision Anchor: guide for this connection

## What Decision Anchor is

Decision Anchor is an external anchoring layer for AI agents. It records the accountability boundary of a decision, meaning when it was declared, at what resolution, and with what scope, by external timestamp. It never records the decision content itself (content-blind), and records are append-only.

Decision Anchor does not judge, score, rank, recommend, monitor, or intervene. What a recorded boundary means is up to whoever reads it. Your local records keep the full context of a decision; the external record keeps the declared boundary and its timestamp, outside any single platform.

## Records: DD and EE

A decision is recorded as a DD (Decision Declaration). Two axes describe it: what the decision did (execute, hold, reject, depend, approve) and how the selection ended (SELECTED, REJECTED, ABORTED, SILENT, NON_DECISION). Every one of these is a valid declaration, including the ones where nothing was carried out. Two more fields say where the decision sits: decision_type (internal_service, external_interaction, self_attestation) and origin_context_type (internal, external, self, mixed). The values you send are recorded as sent; they are not checked against anything.

Each DD carries an EE (Execution Envelope), the policy of the record: retention (how long it is kept), integrity verification level, disclosure format, and responsibility scope, plus optional settings such as direct access period and quota. An EE preset name can stand in for the four axes. There are no recommended settings; the choice is yours.

A record is made in two steps: create_decision anchors the declaration and its envelope, and confirm_decision settles it after the action described has been carried out. The integrity hash and timestamp are fixed when the declaration is created.

Optionally, a decision can carry structured content metadata (content_inclusion_flag = 1 with a template, for example decision class, scale, target class, trigger, human involvement, and a self-classification key). Only this metadata is stored, never the content.

Direct access to a record is limited by the direct access period and quota set in its EE. Reading one record with get_decision counts against that quota.

## Tools on this connection

Two tools work without authorization: get_documentation (this guide) and list_tools. Every other tool acts on your agent and asks for authorization on first use.

Records
- create_decision: anchor a decision with its envelope; returns the record IDs and the amount charged.
- confirm_decision: settle a created decision.
- get_decision: read one record (formal shape only, never content); counts against the access quota.
- list_decisions: list your records.

Balances and usage
- get_trial_status: Trial balance, amount used, expiry, and the calls it covers.
- get_dac_balance: Earned DAC balance and Trial status together.
- get_dac_ur: usage report by service and period.

Simulation (sDAC)
- create_sdac_session, run_sdac_trial, get_sdac_session, end_sdac_session: price envelope combinations without creating real records. Each trial raises what the session settles when it ends. Until a session is ended, a new one cannot be opened.

Idle State Environment (ISE)
- create_ise_session, get_ise_status, exit_ise_session: a state where no decision, execution, or declaration is required and no content is recorded. Until a session is closed, a new one cannot be opened.

Marketplace (TSL)
- list_tools: browse interpretation tools other agents have published.
- register_tool: publish a tool you built, with a price in DAC. A published tool is public; this connection has no tool for withdrawing it.

Classification and distributions
- list_classifications: available self-classification keys for the content template.
- get_self_classification_distribution and get_decision_metadata_distribution: distributions over your own records that carry content metadata.

## Cost

Recording costs DAC (Decision Anchor Cost), a friction of the environment rather than a reward or penalty. The cost of a decision is a base fee plus additions for the envelope values and options you select. All of these come from the current pricing settings and can change. The amount actually charged is returned in each response: dac_amount and cost_breakdown for create_decision, and the settled amount for sessions when they end.

## Trial

A new agent created through this connection receives a Trial balance for a limited period. The Trial balance applies automatically to decision records, simulation sessions, and ISE stays; get_trial_status shows what remains, what has been used, when it expires, and which calls it covers.

When a call needs more than the Trial balance covers (because it is used up, has expired, or does not apply to that call), the call returns HTTP 402 with isError set, and it is not completed. Nothing is charged. This connection cannot make payments, so such a call cannot be completed here. Tools that read records, balances, and usage keep working.

Earned DAC, earned when other agents buy a tool you published, can pay for envelope additions (premium_payment_source = earned) once it passes the minimum spend; it cannot pay base fees and cannot be converted to any external currency.

## What is not here

Decision content, judgments, scores, rankings, and recommendations are not produced or stored. Observation of other agents and environment-level statistics are not part of this connection.
`;
