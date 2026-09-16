# Design: Payroll Calculation Transaction Safety

> **Status: IMPLEMENTED**
>
> Implemented and validated in commit `6216145`.
> Sections describing the "current" flow refer to the pre-implementation baseline used to design this change.

## 1. Current `CalculatePayrollUseCase` Flow

### 1.1 Annotated step-by-step trace

```
CalculatePayrollUseCase.execute(companyId, currentUserId, year, month, payrollType)
│
├── [DB READ]   payrollPeriod.findFirst          ← status guard, outside any tx
├── [GUARD]     status ∈ allowedStatuses?
├── [DB READ]   employee.findMany                ← active employees, outside any tx
├── [GUARD]     employees.length > 0?
│
├── [DB WRITE]  payrollPeriod.create             ← only if period does not exist
│                                                   creates period in DRAFT status
│
├── [DB READ]   payrollItem.findMany             ← find existing item IDs
│
├── [DB WRITE]  payrollConceptDetail.deleteMany  ← delete old concepts
├── [DB WRITE]  payrollItem.deleteMany           ← delete old items
│
└── FOR each employee:
    ├── [DB READ]    payrollNovelty.findMany     ← novelties for this employee+period
    ├── [CALC]       calculator.calculate(...)   ← pure in-memory, no DB
    │
    ├── [DB WRITE]   payrollItem.create          ← one row per employee
    └── FOR each concept:
        └── [DB WRITE] payrollConceptDetail.create  ← N rows per employee
│
├── [DB WRITE]  payrollPeriod.update(status=CALCULATED)
│
└── [DB WRITE]  auditLog.create (CALCULATE_PAYROLL)  ← outside any tx
```

### 1.2 Database writes inventory

| # | Write | Table | Condition |
|---|---|---|---|
| 1 | `payrollPeriod.create` | `PayrollPeriod` | Period did not exist |
| 2 | `payrollConceptDetail.deleteMany` | `PayrollConceptDetail` | Period had previous items |
| 3 | `payrollItem.deleteMany` | `PayrollItem` | Period had previous items |
| 4 | `payrollItem.create` | `PayrollItem` | One per eligible employee (in loop) |
| 5 | `payrollConceptDetail.create` | `PayrollConceptDetail` | One per concept (nested loop) |
| 6 | `payrollPeriod.update` | `PayrollPeriod` | Always — promotes status |
| 7 | `auditLog.create` | `AuditLog` | Always — after status update |

Writes 2–7 are currently non-atomic. Write 1 remains outside the persistence transaction by design (see section 2.3). The unique constraint on `(companyId, year, month, payrollType)` prevents duplicate persisted rows, but it does not make two concurrent first-time create requests race-free — one could still receive a unique-constraint error. Concurrent `PayrollPeriod` creation is out of scope for this feature.

---

## 2. Recommended Transaction Boundary

### 2.1 Decision

The transaction must cover writes 2–7 only. Writes and reads that happen before the transaction opens (reads for status guard, employee list, novelty fetch per employee; write 1 for period creation) remain outside.

### 2.2 Boundary diagram

```
─── OUTSIDE TRANSACTION ──────────────────────────────────────────────────────
 payrollPeriod.findFirst    (status guard)
 employee.findMany          (employee list)
 [for each employee]:
   payrollNovelty.findMany  (novelties)
   calculator.calculate()   (pure in-memory — NEVER inside a transaction)
 payrollPeriod.create       (only if period did not exist; remains outside by design — see section 2.3)

─── COLLECT RESULTS IN MEMORY ────────────────────────────────────────────────
 Build array: CalculatedEmployeeResult[]
   { employeeId, baseSalary, earnedTotal, deductionsTotal, netPay, concepts[] }

─── OPEN TRANSACTION ─────────────────────────────────────────────────────────
 1. payrollConceptDetail.deleteMany  (via tx)
 2. payrollItem.deleteMany           (via tx)
 3. FOR each CalculatedEmployeeResult:
      payrollItem.create             (via tx)
      FOR each concept:
        payrollConceptDetail.create  (via tx)
 4. payrollPeriod.update(CALCULATED) (via tx)
 5. auditService.log(..., tx)        (via tx — AuditLog inside same tx)
─── TRANSACTION COMMITS OR ROLLS BACK ATOMICALLY ─────────────────────────────

 return period.id
```

### 2.3 Why this boundary

- **No pure computation inside the transaction.** `PayrollCalculatorService`, `SeverancePayrollCalculator`, `ServiceBonusPayrollCalculator`, and `AccruedDaysCalculator` are purely in-memory. Including them would lengthen the transaction by the time of N CPU-bound calculations across all employees, increasing lock hold time proportional to company size.
- **No status-guard reads inside the transaction.** The `findFirst` for status validation is a point-in-time snapshot; re-reading inside the transaction offers no additional guarantee unless accompanied by a `SELECT ... FOR UPDATE` or optimistic versioning (out of scope here).
- **Novel-fetch reads stay outside.** Each `payrollNovelty.findMany` per employee is read-only and referenced only by the in-memory calculation. They do not need to be inside the write transaction.
- **`payrollPeriod.create` stays outside.** It remains outside the persistence transaction by design. A sequential retry after a failed calculation will find the existing `DRAFT` period and skip the create entirely. Two concurrent first-time requests for the same period parameters may race and one may receive a unique-constraint error from the database; that concurrency scenario is out of scope for this feature and will be addressed by a separate `PayrollPeriod` optimistic concurrency feature.
- **Audit inside the transaction.** This matches the pattern established by `EmploymentTerminationsService.calculate` and satisfies REQ-5.

---

## 3. Intermediate Data Structure

A new local interface (inside the use case file, no new file needed) accumulates results before the transaction opens:

```typescript
interface CalculatedEmployeeResult {
  employeeId: string;
  companyId: string;
  payrollPeriodId: string;
  baseSalary: number;
  earnedTotal: number;
  deductionsTotal: number;
  netPay: number;
  concepts: Array<{
    code: string;
    name: string;
    type: ConceptType;
    amount: number;
  }>;
}
```

The `for` loop over employees is refactored into two phases:

**Phase 1 — outside transaction:** for each employee, fetch novelties, run calculator, push a `CalculatedEmployeeResult` onto an array. No DB writes.

**Phase 2 — inside transaction:** iterate the results array, write `PayrollItem` + `PayrollConceptDetail`, then write `PayrollPeriod.update` and `auditLog.create`.

---

## 4. `AuditService` Participation

`AuditService.log` already has the required signature:

```typescript
async log(
  data: CreateAuditLogInput,
  client: Prisma.TransactionClient | PrismaService = this.prisma,
)
```

No change to `AuditService` is needed (REQ-10). Inside the transaction callback, the call becomes:

```typescript
await this.auditService.log(
  {
    companyId,
    userId: currentUserId,
    action: 'CALCULATE_PAYROLL',
    entity: 'PayrollPeriod',
    entityId: period.id,
    newValue: { year, month, status: PayrollStatus.CALCULATED },
  },
  tx,   // ← passes tx, same pattern as EmploymentTerminationsService
);
```

---

## 5. Services and Signatures That Need to Accept `Prisma.TransactionClient`

Only one change is needed:

| File | Change |
|---|---|
| `src/payroll/use-cases/calculate-payroll.use-case.ts` | Wrap persistence phase in `this.prisma.$transaction(async (tx) => { ... })`. Pass `tx` to `auditService.log`. Use `tx` for all DB writes inside the block. |

No other service signature changes are required:

- `AuditService.log` — already accepts `tx` (no change).
- `PayrollCalculatorService` — pure, no DB access (no change).
- `SeverancePayrollCalculator` — pure, no DB access (no change).
- `ServiceBonusPayrollCalculator` — pure, no DB access (no change).
- `AccruedDaysCalculator` — pure, no DB access (no change).
- `PayrollService` — thin facade, delegates to use case (no change).
- `PayrollController` — unchanged API (no change).

---

## 6. Handling `payrollConceptDetail.create` Inside the Transaction

The current implementation calls `payrollConceptDetail.create` one row at a time in a nested loop. This pattern is preserved inside the transaction for correctness (each create is still transactional with the others). However, as a performance note (not in scope for this feature), this could be replaced with `payrollConceptDetail.createMany` in a future optimization. The spec does not require that change.

---

## 7. Transaction Duration and Concurrency Considerations

### 7.1 Transaction duration

The transaction will hold a write lock on:

- `PayrollConceptDetail` rows for the period (delete + create)
- `PayrollItem` rows for the period (delete + create)
- `PayrollPeriod` row for the period (update)
- `AuditLog` (insert — no lock contention expected)

Duration is bounded by: (number of employees) × (average number of concepts per employee) × (single-row insert latency). For a typical small-to-medium Colombian company (10–200 employees, ~13 concepts each), this is in the order of milliseconds to low seconds on a local PostgreSQL instance. This is acceptable.

### 7.2 Concurrent calculation requests for the same period

This feature guarantees that each individual calculation attempt is all-or-nothing: either all persistence writes for that attempt commit together, or none do. It does **not** guarantee that two simultaneous calculations of the same `PayrollPeriod` serialize semantically.

If two concurrent `POST /payroll/calculate` requests reach their persistence transactions simultaneously, both will attempt to delete and re-create `PayrollItem` rows for the same period. The interaction between those two transactions depends on PostgreSQL isolation level, row-lock visibility, and the exact interleaving — outcomes are not fully predictable without a rigorous proof of the specific statements and constraints involved. Claiming that "the final persisted state will be one complete set of items from whichever transaction committed last" would require proving isolation behavior for each statement, which is not attempted here.

The correct solution is `PayrollPeriod` optimistic concurrency (a `version` field with `updateMany` + count check), tracked as a separate feature. This design must not claim to solve concurrent calculate requests, and nothing in this implementation should be read as providing that guarantee.

### 7.3 Interaction with approve/close/reopen

Atomic persistence does not protect lifecycle transitions from stale status reads. The status guard (`payrollPeriod.findFirst` + in-process check) happens before the transaction opens, and there is no optimistic lock on `PayrollPeriod.status`. The following sequence is possible in principle:

1. A `calculate` request reads `status = CALCULATED` (allowed) and proceeds.
2. An `approve` request concurrently transitions the period to `APPROVED`.
3. The `calculate` request reaches its transaction and writes `status = CALCULATED`, overwriting `APPROVED`.

This is not a harmless no-op: it would silently undo an approval and potentially corrupt the lifecycle state. This feature does not introduce or worsen this race — it existed before — but it also does not solve it. The separate `PayrollPeriod` optimistic concurrency/versioning feature must address this by ensuring that the `payrollPeriod.update` inside the persistence transaction fails atomically if the status has been changed by another operation since the guard read.

This design must not imply that `APPROVED` or `CLOSED` periods are protected from concurrent calculation overwrites.

### 7.4 Deadlock risk and residual concurrency

**Deadlock risk**: the persistence transaction touches tables in the intended order `PayrollConceptDetail` → `PayrollItem` → `PayrollPeriod` → `AuditLog`. Maintaining a consistent write order across all callers reduces (but cannot categorically eliminate) deadlock risk — concurrent calculations, future flows, or unanticipated lock interactions could still produce deadlocks. Keeping the transaction short (no in-memory calculation inside it) reduces lock exposure. PostgreSQL will roll back a transaction on deadlock detection, which satisfies the atomicity requirement: the entire transaction rolls back and the error propagates to the caller. No partial state is left. A retry policy for transient failures, if required, is outside the scope of this feature.

**Residual concurrency — stale calculation inputs**: the employee list and novelty reads happen before the persistence transaction opens, so this feature does not provide a consistent database snapshot across calculation inputs. A novelty added or changed after it was read but before the transaction commits would make the persisted result stale with respect to the final novelty state. This limitation existed before this change and is not resolved by atomic persistence. Expanding scope to fix it is not part of this feature.

### 7.5 No nested transactions

Prisma does not support true nested transactions (savepoints are not used here). `AuditService.log` uses the passed client directly, which is the top-level transaction client. There are no nested `$transaction` calls. This is consistent with the `EmploymentTerminationsService` reference implementation.

---

## 8. Architectural Reference: `EmploymentTerminationsService.calculate`

`EmploymentTerminationsService.calculate` (file: `src/employment-terminations/employment-terminations.service.ts`) follows the same pattern this design prescribes:

1. All reads and guards happen before `$transaction`.
2. The in-memory `terminationPayrollCalculator.calculate(...)` call happens before `$transaction`.
3. Inside `$transaction(async (tx) => { ... })`:
   - writes use `tx` exclusively;
   - `auditService.log(..., tx)` is called with the transaction client.
4. No nested `$transaction` calls.

This feature applies the same pattern to `CalculatePayrollUseCase`, with the only structural difference being that payroll calculation iterates over N employees rather than a single entity.

---

## 9. Summary of Changes

| File | Nature of change |
|---|---|
| `src/payroll/use-cases/calculate-payroll.use-case.ts` | Restructure: collect all calculation results in memory before opening transaction; wrap all DB writes (deletes + inserts + status update + audit) in `$transaction`; pass `tx` to all writes and to `auditService.log` |
| `src/payroll/use-cases/calculate-payroll.use-case.spec.ts` | Update: add `$transaction` mock to `prismaMock`; add transaction-client mock (`tx`) with sub-mocks for each table; add rollback/failure test cases; update existing assertions to reference `tx.*` instead of `prisma.*` for transactional writes |
| `test/app.e2e-spec.ts` | Add real PostgreSQL rollback verification for first-time calculation failure and failed recalculation |

### Files that must not change

| File | Reason |
|---|---|
| `src/audit/audit.service.ts` | Already supports `tx` parameter; no change needed |
| `src/payroll/payroll-calculator.service.ts` | Pure calculation; not involved |
| `src/payroll/calculator/**/*.ts` | All pure calculators; not involved |
| `src/payroll/payroll.service.ts` | Thin facade; not involved |
| `src/payroll/payroll.controller.ts` | API contract unchanged |
| `src/payroll/payroll.module.ts` | DI wiring unchanged |
| `src/payroll/use-cases/approve-payroll-period.use-case.ts` | Out of scope |
| `src/payroll/use-cases/close-payroll-period.use-case.ts` | Out of scope |
| `src/payroll/use-cases/reopen-payroll-period.use-case.ts` | Out of scope |
| `src/employment-terminations/**` | Not involved |
| `prisma/schema.prisma` | No schema changes |