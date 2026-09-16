# Requirements: Payroll Calculation Transaction Safety

> **Status: IMPLEMENTED**
>
> Implemented and validated in commit `6216145`.
> This document is retained as the requirements record for the completed feature.

## Context

`CalculatePayrollUseCase` is responsible for:

1. Validating that the payroll period may be (re)calculated.
2. Fetching active employees and their novelties.
3. Running in-memory payroll calculations.
4. Persisting the results (`PayrollItem`, `PayrollConceptDetail`, `PayrollPeriod` status, `AuditLog`).

Currently, steps 3 and 4 are not separated. All persistence writes happen sequentially outside any database transaction, which creates three concrete risks:

- **Partial financial state**: if a write fails mid-loop (e.g., a database timeout after some `PayrollItem` rows are inserted but before all are written), the preceding writes have already been committed. The `PayrollPeriod` is left with an incomplete set of items and its status may or may not have been updated, depending on where the failure occurred.
- **Status/items inconsistency**: the `payrollPeriod.update(status = CALCULATED)` write is independent from the item/concept writes. A failure between those two steps can leave the status updated but items incomplete, or items written but status still `DRAFT`.
- **Audit/financial inconsistency**: the `auditLog.create` write happens after `payrollPeriod.update` and is also independent. If that write fails, the financial state is already committed as `CALCULATED` with no corresponding audit record. Conversely, an audit write cannot succeed for a calculation that was never committed, because the audit write is the last step — but any earlier individual financial write that committed before a subsequent failure will remain persisted.

This feature makes the entire persistence phase atomic without changing any calculation logic, any API surface, or any payroll lifecycle semantics.

---

## Requirements

### REQ-1 — Successful calculation commits all related writes atomically

When a payroll calculation completes without error, the following writes must all succeed as a single atomic unit:

- deletion of existing `PayrollConceptDetail` rows for the period;
- deletion of existing `PayrollItem` rows for the period;
- creation of new `PayrollItem` rows for every employee that the current calculation flow determines is eligible for that payroll type (SEVERANCE and BONUS may skip employees whose `accruedDays <= 0`; ordinary payroll types include all active employees; this feature must not introduce any new eligibility rule or change any existing one);
- creation of new `PayrollConceptDetail` rows (one per concept per employee);
- update of `PayrollPeriod.status` to `CALCULATED`;
- creation of the `AuditLog` record for `CALCULATE_PAYROLL`.

**Acceptance criteria**:
- After a successful call to `POST /payroll/calculate`, all rows listed above are present in the database, and `PayrollPeriod.status = CALCULATED`.
- The `AuditLog` record with `action = 'CALCULATE_PAYROLL'` exists for the same period.
- The returned API response is identical to the current response.

### REQ-2 — A database failure during persistence rolls back all related writes

If any database operation inside the persistence transaction fails, the rollback behavior depends on whether this is a first-time calculation or a recalculation of an existing period.

**First-time calculation** (period was just created as `DRAFT` before the transaction):

- No `PayrollItem` rows are persisted for the period.
- No `PayrollConceptDetail` rows are persisted for the period.
- `PayrollPeriod.status` remains `DRAFT`.
- No `AuditLog` row for this calculation attempt is persisted.
- The `PayrollPeriod` row itself (in `DRAFT`) remains — see REQ-9 for why this is intentional.

**Recalculation of an existing period** (period was already `CALCULATED` or `REOPENED` and had prior items):

- The previously committed `PayrollItem` rows are restored exactly as they were before the failed attempt (the delete of old rows is part of the same transaction as the new inserts, so the rollback un-deletes them).
- The previously committed `PayrollConceptDetail` rows are likewise restored.
- `PayrollPeriod.status` is unchanged from its pre-attempt value.
- No `AuditLog` row for this failed attempt is persisted.

This requirement does not contradict REQ-4: REQ-4 defines the atomicity guarantee that makes the recalculation rollback in this requirement possible.

**Acceptance criteria**:
- When the persistence transaction is forced to fail on a first-time calculation, the `PayrollPeriod` remains in `DRAFT` with zero `PayrollItem` rows and zero `PayrollConceptDetail` rows for that period.
- When the persistence transaction is forced to fail on a recalculation, the prior `PayrollItem` and `PayrollConceptDetail` rows for the period are present and unmodified after the failure, and `PayrollPeriod.status` is unchanged.
- In both cases, no `AuditLog` record for `CALCULATE_PAYROLL` exists for the failed attempt.

### REQ-3 — PayrollPeriod must not end in CALCULATED if its items were not fully persisted

A `PayrollPeriod` must never have `status = CALCULATED` while its associated `PayrollItem` / `PayrollConceptDetail` rows are absent or incomplete.

**Acceptance criteria**:
- The `payrollPeriod.update({ status: CALCULATED })` write is inside the same transaction as the item/concept creation writes.
- If item creation fails after the update or vice versa, the entire transaction is rolled back.

### REQ-4 — Previous items and details must not be partially replaced

When recalculating an already-`CALCULATED` or `REOPENED` period, the deletion of old rows and insertion of new rows must be atomic. It must not be possible for the period to exist in a state where old items are partially deleted and new items are partially written.

**Acceptance criteria**:
- Both `payrollConceptDetail.deleteMany` and `payrollItem.deleteMany` happen inside the same transaction as the new inserts.
- If a new insert fails, the old rows are restored (i.e., the entire transaction rolls back — old rows are never committed as deleted unless new rows are committed as inserted).

### REQ-5 — Audit must not claim a completed calculation if the financial writes rolled back

The `AuditLog` row for `CALCULATE_PAYROLL` must be created inside the same database transaction as the financial writes. If the transaction rolls back, the audit record must not be persisted.

**Acceptance criteria**:
- `auditService.log(...)` is called with a `Prisma.TransactionClient` (same `tx`) inside the transaction, not outside it.
- If the transaction is rolled back, no `AuditLog` row for the failed attempt exists.
- This matches the existing pattern in `EmploymentTerminationsService.calculate`.

### REQ-6 — Calculated totals and API response are unchanged when there is no failure

The payroll calculation formulas, concept codes, concept names, amounts, `earnedTotal`, `deductionsTotal`, and `netPay` must be identical before and after this change. The `POST /payroll/calculate` response shape must not change.

**Acceptance criteria**:
- All existing unit tests for `CalculatePayrollUseCase` pass without modification to their logical assertions.
- The E2E test for payroll calculation (`POST /payroll/calculate`) passes and the response body is identical to the current shape.
- No calculator class is modified.

### REQ-7 — Tenant isolation remains unchanged

The `companyId` scoping applied to all queries must not change as a result of this refactor.

`PayrollItem` carries a direct `companyId` field and every new `PayrollItem` write must include the correct `companyId`. `PayrollConceptDetail` has no direct `companyId` field in the schema — it is scoped to a tenant exclusively through its `payrollItemId` foreign key, which references a `PayrollItem` that already belongs to a company. `AuditLog` carries a direct `companyId` field.

**Acceptance criteria**:
- `companyId` is present and correct on every new `PayrollItem` row written inside the transaction.
- `companyId` is present and correct on the `AuditLog` row written inside the transaction.
- `PayrollConceptDetail` rows are correctly scoped by being linked to a `PayrollItem` that belongs to the correct company; no additional `companyId` field is required or added.
- No query inside the transaction omits a `companyId` filter that was present before the refactor.

### REQ-8 — The transaction must not wrap pure in-memory calculation work

The database transaction must be opened only after all in-memory calculations are complete. The transaction scope must not include:

- the `payrollPeriod.findFirst` read (status guard);
- the `employee.findMany` read (employee list);
- the `payrollNovelty.findMany` reads (per-employee novelties);
- the in-memory calls to `PayrollCalculatorService`, `SeverancePayrollCalculator`, `ServiceBonusPayrollCalculator`, or `AccruedDaysCalculator`.

**Rationale**: wrapping CPU-bound computation inside a long-running transaction unnecessarily holds database locks and increases the risk of deadlock with other concurrent requests to the same company's data.

**Acceptance criteria**:
- The `$transaction` callback contains no calls to the pure calculator services.
- The calculations are performed outside the transaction and the results are passed into the transaction as plain data structures.

### REQ-9 — The `payrollPeriod.create` for a new period happens outside the transaction, and the resulting DRAFT period is intentionally retained on failure

When no period exists yet, the `payrollPeriod.create` (which creates the period in `DRAFT` status) happens before the persistence transaction opens. The transaction only handles item/concept writes, the status promotion to `CALCULATED`, and the audit write.

**Intentional behavior on failure**: if the `payrollPeriod.create` succeeds but the subsequent persistence transaction fails, the `PayrollPeriod` row remains in the database with `status = DRAFT` and no associated `PayrollItem`, `PayrollConceptDetail`, or `AuditLog` rows. This is intentional: the period record acts as a stable identifier for the calculation attempt and can be retried. The endpoint as a whole is therefore not atomic with respect to the period row itself — the period is created outside the transaction — but no calculated financial state is ever persisted without a corresponding successful transaction.

**Rationale for keeping `payrollPeriod.create` outside**: the create is protected by a unique constraint on `(companyId, year, month, payrollType)`. Placing it inside the transaction would extend the lock window without benefit. A sequential retry after a failed calculation will find the existing `DRAFT` period via `payrollPeriod.findFirst`, pass the status guard, and proceed directly to the persistence transaction without a second create. Note that two concurrent first-time calculation requests for the same period parameters could still collide on the unique constraint — one would receive a database error from the `create` call. That concurrent creation scenario is outside the scope of this feature; `PayrollPeriod` optimistic concurrency and idempotency will be handled in a separate feature.

**Acceptance criteria**:
- The `payrollPeriod.create` call remains outside the `$transaction` block.
- If the persistence transaction fails on a first-time calculation, the `PayrollPeriod` row exists in `DRAFT` status with no `PayrollItem`, `PayrollConceptDetail`, or `AuditLog` rows.
- A subsequent retry of `POST /payroll/calculate` for the same period will find the existing `DRAFT` period, pass the status guard, and attempt the transaction again.

### REQ-10 — `AuditService.log` signature requires no change

`AuditService.log` already accepts an optional `Prisma.TransactionClient | PrismaService` as its second parameter (`src/audit/audit.service.ts`). This signature must not be changed. Callers inside the transaction must pass `tx` as the second argument.

**Acceptance criteria**:
- `AuditService` source file is not modified.
- The call site in `CalculatePayrollUseCase` passes `tx` as the second argument to `auditService.log(...)`.

---

## Out of Scope for This Feature

- Optimistic concurrency on `PayrollPeriod` (a `version` field): tracked separately.
- Fixing floating-point arithmetic in calculators: tracked separately.
- Historical payroll rate versioning: tracked separately.
- Adding audit logging for `CREATE_PAYROLL_PERIOD`: tracked separately.
- Any change to the approve, close, or reopen use cases.
- Any change to `EmploymentTerminationsService`.
- Any change to the payroll calculation formulas.