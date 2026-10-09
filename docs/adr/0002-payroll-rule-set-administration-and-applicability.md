# ADR-0002: PayrollRuleSet administration and applicability

- Status: Accepted
- Date: 2026-10-08
- Refines: [ADR-0001: Versionado y resolución de reglas de nómina](0001-versioned-payroll-rules.md)
- Scope: Approved architectural direction for future implementation; this documentation slice changes no runtime behavior or schema.

## Context and problem

ADR-0001 establishes globally shared, jurisdiction-specific PayrollRuleSet snapshots and calculation provenance through `calculatedRuleSetId`. Its original temporal model places dates on the snapshot. Administration also needs to schedule successors and withdraw future applicability without changing the evidence used by an existing calculation.

Using those same dates as both immutable approval evidence and a mutable operational calendar creates a conflict: closing a published predecessor's `effectiveTo` would mutate historical evidence. Rejecting every scheduling change instead would prevent ordinary prospective administration. Publication, current applicability and historical calculation provenance therefore need distinct meanings.

The decision preserves the NestJS modular monolith, Prisma/PostgreSQL persistence and existing calculator boundaries. It introduces no legal values or formulas, and does not certify Colombian legal correctness. `DEFAULT_PAYROLL_RULES` remains compatibility/test infrastructure, not verified legal truth.

## Decision and temporal semantics

### Immutable snapshot

A published PayrollRuleSet is absolutely immutable, including its identity, jurisdiction, version, schema, payload, approved dates and publication metadata. There is no exception allowing mutation of a published `effectiveTo`. Changed content or a changed approved envelope requires a new snapshot.

Snapshot dates express the immutable approved temporal envelope, conceptually `approvedEffectiveFrom` and `approvedEffectiveTo`. Future implementation must use unambiguous naming that distinguishes this envelope from operational applicability. This ADR does not rename existing schema fields.

Business-date intervals retain ADR-0001's half-open semantics: `[from, to)`. An open-ended interval, where supported, must retain an explicit, consistent representation. An applicability interval must lie entirely inside its published snapshot's approved envelope; scheduling cannot extend an approval.

`PUBLISHED` means immutable published content. A snapshot removed from the current schedule remains `PUBLISHED`; absence from the schedule is not unpublication or a new content lifecycle state.

### Operational applicability

A future `PayrollRuleSetApplicability` persistence model is the authoritative calendar for **new unpinned selection**. It represents the scheduled snapshot, jurisdiction, operational interval and identity/revision/state needed for concurrency checks. Snapshot approval dates alone must not determine current selection after the transition.

Current applicability changes only through explicit audited operations. Initially those operations support prospective schedule changes only; retroactive corrections are out of scope. A normal successor operation closes its predecessor's applicability exactly at the successor start, without changing the predecessor snapshot's approved envelope.

The schedule must prevent overlapping applicability within a jurisdiction. It does not initially require global continuity: gaps are allowed, and a missing applicable rule produces an explicit resolver failure. Resolution is date-based, so future applicability requires no activation scheduler.

This separation does not change ADR-0001's business-date policies or authorize segmented payroll. Existing full-period coverage requirements remain; matching endpoint snapshot IDs must not be used to bypass a schedule gap inside a required covered interval.

## Historical determinism and selection

Pinned recalculation uses `calculatedRuleSetId`. It validates the referenced immutable snapshot's identity, jurisdiction, publication state, supported schema/payload and approved envelope against the calculation's required business date or interval. It does **not** require membership in the current applicability schedule.

If a pinned snapshot is missing, invalid or outside its approved envelope, recalculation fails explicitly. It never silently clears or replaces the pin, falls back to current applicability or selects a newer version. Removing a snapshot from the schedule does not invalidate an otherwise valid historical pin.

Unpinned calculations resolve through the current applicability schedule and validate the selected snapshot. Persistence commits the selected `calculatedRuleSetId` only after the concurrency checks described below. Already-calculated future payroll is never automatically repinned after a schedule change. Remediation or deliberate repinning requires a future explicit workflow.

This preserves rule provenance and deterministic snapshot choice within the existing materialized-result lifecycle. It does not introduce a history of calculation runs or claim reproducibility of inputs that the current lifecycle does not retain.

## Concurrency model

### Selection to pin

Do not hold a jurisdiction advisory lock across the full payroll calculation. Such a lock would serialize expensive calculation work with administration and increase contention and transaction duration.

The resolver should eventually return applicability identity and revision/state alongside the snapshot. Before committing a new pin, persistence must verify that the expected schedule revision/state still authorizes that selection. The verification and pin commit must share a transactional concurrency boundary that prevents a schedule mutation between verification and commit. A standalone check followed by an unprotected write is insufficient.

A stale schedule aborts the attempted persistence and retries selection, or returns an explicit conflict when retries are exhausted. Results computed with a stale selection must not be committed as if the selection remained valid. Retry does not authorize replacement of an existing pin. The precise persistence protocol remains an implementation detail to verify with concurrency tests; any jurisdiction lock used at commit must be brief and exclude the full calculation.

### Schedule mutation

Every schedule mutation uses an advisory transaction lock per jurisdiction, row/state checks and an expected revision/state supplied as a concurrency precondition. The application must revalidate under the lock rather than rely on an earlier read.

Persistence must enforce a jurisdiction overlap constraint as an independent integrity backstop. Application validation must also check publication state, interval validity and containment within approved envelopes. Mutation and its audit are one transaction; a failed audit rolls back the mutation.

Concurrent stale administration requests conflict rather than overwrite each other. Locking, expected state and database constraints complement one another: the lock serializes cooperating writers, expected state detects stale intent, and the constraint protects integrity regardless of application code.

## Draft lifecycle

- The server controls the draft ID. Jurisdiction is chosen at creation and is immutable afterward.
- The server assigns a version per jurisdiction under concurrency-safe locking, with persistence uniqueness protection. Version is an identity, not a legal year or a claim about chronological applicability.
- A separate server-controlled draft revision tracks edits; version and draft revision have different purposes.
- `schemaVersion`, `rulesPayload` and approved dates are editable only while `DRAFT`.
- Status and `publishedAt` are never client-writable.
- Every save requires a complete structurally valid payload; incomplete payload persistence is not a draft feature.
- There is initially no draft deletion capability. Abandoned drafts may remain, and version allocation must not assume that every draft will be published.

Any technical validation or review evidence is bound to the draft revision and deterministic fingerprint of the reviewed content. Editing a draft invalidates previous evidence; passing validation of an earlier revision cannot authorize publication of an edited draft. Fingerprinting must use a documented deterministic representation and bind the evidence to all reviewed snapshot content, including schema and approved dates, rather than payload alone.

## Validation layers

These layers remain distinct, with explicit outcomes and evidence:

| Layer                           | Responsibility                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| Structural/schema               | Supported schema, complete payload, field types and required shape. Required on draft save.     |
| Mathematical/domain consistency | Relationships and calculation invariants using decimal-safe arithmetic.                         |
| Temporal/applicability          | Valid approved envelope, schedule containment, non-overlap and required business-date coverage. |
| Operational/legal-source review | Traceable source review and operational readiness performed through an explicit review process. |

Structural acceptance is not mathematical approval, and neither proves legal validity. Code must never claim Colombian legal correctness by itself. Legal percentages, thresholds, values and dates continue to flow through versioned rules rather than hardcoded calculator constants. Review evidence must identify the exact revision/fingerprint it concerns; a generalized approval workflow is deferred.

## Publication and retry semantics

Publication freezes a reviewed snapshot and records publication metadata atomically with its audit. The request must identify the expected reviewed revision/fingerprint; stale evidence cannot publish changed content. Publication of content and changing applicability are distinct domain operations: publication alone does not establish current applicability.

Publication and applicability remain distinct domain concepts with separate invariants, but a future normal successor administration command may compose them atomically. In one transaction, the operation performs actor revalidation, expected draft revision/fingerprint validation, jurisdiction schedule lock/state validation, successor snapshot publication, predecessor applicability closure exactly at the successor start, successor applicability creation, and publication and schedule audits. No intermediate committed state is required between publication and scheduling. Publishing a snapshot by itself still does not imply active or current applicability.
The approved future retry behavior is:

- The same already-published snapshot with the same expected reviewed revision/fingerprint returns `200` and the existing publication state. It creates no second publication audit.
- A different or stale revision/fingerprint, or a conflicting lifecycle state, returns `409`.

Persistence must retain sufficient immutable publication evidence to recognize the first case under concurrent retries. An idempotent retry does not mutate the publication. No idempotency-key infrastructure is introduced. Publication HTTP on the current lifecycle remains out of scope; these semantics guide a future implementation rather than authorize an endpoint now.

## Actor, authorization and audit

The actor is derived from authenticated `request.user.sub`, never supplied by the client. Sensitive application writes revalidate the actor and relevant platform authorization within the transaction. Existing platform and tenant guards and database scope invariants remain intact: `SUPER_ADMIN` has `companyId = null`, and tenant roles cannot administer global rules through tenant role assignment flows.

Every successful sensitive mutation and its audit commit atomically. Audit failure must roll back the write. Audit entries include relevant metadata, before/after state, revisions and a deterministic payload fingerprint, but never the complete `rulesPayload`. The immutable snapshot remains the source of rule content.

Schedule changes record predecessor/successor IDs, affected intervals, reason and a shared operation identifier linking the related changes. Before/after state must make the operational change reconstructable without treating the audit as event-sourced persistence. Content fingerprints and reviewed-snapshot fingerprints must have documented scope so they cannot be confused.

## Error direction and failure modes

| Condition                                        | HTTP direction   |
| ------------------------------------------------ | ---------------- |
| Malformed transport request                      | `400`            |
| Missing resource                                 | `404`            |
| Structurally, domain or temporally invalid draft | `422`            |
| Stale revision, overlap or lifecycle conflict    | `409`            |
| Authentication failure                           | `401`            |
| Platform authorization failure                   | `403`            |
| Recognized transient persistence unavailability  | May map to `503` |
| Unexpected integrity or audit failure            | Sanitized `500`  |

Do not expose Prisma/SQL internals or sensitive data. Expected overlap conflicts may map to `409`; unexpected integrity failures remain sanitized failures. Missing applicability is an explicit resolver failure, not a default-rule fallback. The exact transport representation of resolver failures belongs to the relevant calculation API contract.

Critical failure modes include stale review evidence, cross-jurisdiction selection, overlapping schedules, coverage gaps, invalid pins, schedule changes during calculation and audit failure. Each must fail closed or retry through its explicit path, never silently substitute rules or persist unaudited administration changes.

## Alternatives, consequences and trade-offs

Mutating published end dates is rejected because it changes historical approval evidence. Treating `PUBLISHED` as currently active is rejected because it conflates content lifecycle with selection and would destabilize pinned recalculation. Keeping immutable snapshot dates as the only calendar is insufficient for prospective replacement inside an approved envelope.

Holding a jurisdiction lock throughout calculation is rejected because it couples administration to calculation duration. Revision-aware commit verification preserves safety with shorter contention windows, at the cost of explicit retry handling. A generalized workflow or distributed coordination service adds operational complexity without a demonstrated need; PostgreSQL transactions, locking and constraints are the smallest coherent design.

In the short term, separate persistence and validation increase implementation work and require a deliberate resolver transition. In the medium term, explicit revision checks, audit boundaries and distinct validation layers improve maintainability and incident diagnosis. In the long term, immutable approval evidence and stable pins preserve regulatory traceability while allowing calendar evolution without rewriting calculator contracts.

Gaps remain possible and require operational attention. Prospective-only changes limit remediation options, and abandoned drafts consume identities. Schedule revisions can cause calculation retries. These costs are accepted to avoid silent historical changes and premature workflow complexity. Application contracts can evolve incrementally, but published evidence and existing pins must never be rewritten as a rollback strategy.

## Migration implications

This ADR creates no schema change, migration, backfill, seed or database operation. Future persistence changes require new migrations; applied migrations must not be edited.

The transition must explicitly distinguish current snapshot dates from future approved-envelope naming and applicability dates. Existing published envelopes remain unchanged. Existing `calculatedRuleSetId` values remain unchanged, and pinned validation must cease depending on current schedule membership before schedules can exclude historically used snapshots.

A reviewed backfill plan must derive initial applicability only where existing publication and temporal data are unambiguous, verify containment and overlaps, and report conflicts or gaps without silently repairing history. It must define the resolver cutover so two competing calendars cannot authorize new selections. Naming changes require a separate compatibility plan for persistence and any exposed contracts; they are not authorized by this documentation slice.

The current PostgreSQL exclusion constraint preventing overlapping `PUBLISHED` PayrollRuleSet snapshot envelopes cannot remain the authoritative calendar constraint after `PayrollRuleSetApplicability` becomes active. The future migration/cutover must preserve published snapshot immutability and basic approved-envelope validity, establish non-overlap on applicability intervals per jurisdiction, and only then retire or replace the existing published-snapshot overlap exclusion constraint in a reviewed new migration. This must occur only after backfill validation and resolver cutover are ready; an already-applied migration must never be edited. Leaving both overlap constraints as authoritative would preserve the current successor dead end: closing predecessor applicability would still leave its immutable approved envelope blocking the successor snapshot.
Future migrations and tests must establish non-overlap, concurrency preconditions, revision/fingerprint evidence and atomic auditing before schedule administration is enabled. Production migrations and seeds require separate explicit authorization.

## Implementation order

1. Define domain contracts for the approved envelope, draft revision/fingerprint, validation outcomes, applicability identity/revision/state and conflicts, preserving calculator boundaries and existing financial arithmetic.
2. Design persistence/cutover migrations, separating draft lifecycle persistence prerequisites from future applicability persistence/backfill. Preserve historical pins and published dates.
3. Implement the minimum draft persistence foundation required for server-controlled revision/review evidence, with migrations and database invariant tests.
4. Implement the draft creation application service with server-assigned jurisdiction version, structural validation, actor revalidation and atomic audit.
5. Implement the draft editing application service with optimistic revision checks, immutable identity fields, fingerprint invalidation and atomic audit.
6. Implement platform HTTP for draft create/detail/update with strict DTOs, safe error mapping and authorization tests.
7. Implement revision-bound validation/review preview, including schedule-impact information but no reservation of the schedule.
8. Implement applicability persistence migration/backfill/cutover with an overlap constraint on applicability and reviewed retirement/replacement of the old snapshot overlap calendar constraint.
9. Integrate the resolver for unpinned applicability selection and pinned independence from the current schedule.
10. Implement selection-to-pin expected-state/revision verification and real concurrency tests.
11. Harden publication with reviewed revision/fingerprint, actor integrity, idempotent retry, safe persistence-error mapping and real audit rollback/concurrency tests.
12. Implement atomic successor scheduling: publish the successor snapshot, close predecessor applicability exactly at successor start, create successor applicability and record linked publication and schedule audits in one transaction.
13. Implement publication HTTP and E2E only after all prior invariants are proven.
14. Implement future schedule replacement/platform audit capabilities as later slices.

Schedule mutation must not be enabled before resolver cutover and pinned recalculation semantics are proven.

## Explicitly deferred topics

- Publication HTTP on the current lifecycle.
- Retroactive schedule corrections and historical schedule remediation policy.
- Silent repinning; a future explicit remediation/repinning workflow is required instead.
- Generalized approval workflow and idempotency-key infrastructure.
- Draft deletion.
- Event sourcing, CQRS, queues, Redis, microservices and other distributed infrastructure.
- `PayrollCalculationRun`, per-concept rules and segmented payroll.
- Production legal values, legal certification and official publication.

ADR-0001's unresolved legal-date policies remain unresolved. This decision supplies an administration and applicability model, not legal validation or permission to access production systems.
