# Tasks: Payroll Calculation Transaction Safety

> **Status: COMPLETED**
>
> All tasks in this specification were completed and validated in commit `6216145`.
> Retained as implementation history. Do not re-execute these tasks unless explicitly requested.

Each task is independently reviewable. Complete them in order. Do not start a task until the previous one has been reviewed and accepted.

---

## Task 1 — Understand the current test structure

**Goal**: confirm the exact shape of the existing unit test mock before making any code changes, so that Task 2 can update it precisely without guessing.

**Steps**:

1. Read `src/payroll/use-cases/calculate-payroll.use-case.spec.ts` in full.
2. Read `src/employment-terminations/employment-terminations.service.spec.ts` lines 355–480 (the `$transaction` mock setup in the `calculate` test) as a pattern reference.
3. Report findings in chat:
   - which properties of `prismaMock` are currently accessed in the existing tests;
   - which of those assertions will need to move from `prismaMock.*` to `tx.*` after the refactor;
   - what the `tx` object shape will need to look like.

**No repository changes of any kind. No code comments. No scratch files.**

**Done when**: you can state in chat with certainty which mock assertions in the existing spec will need to move from `prismaMock.*` to `tx.*`.

---

## Task 2 — Update `calculate-payroll.use-case.spec.ts` with transaction mock infrastructure

**Goal**: add `$transaction` support to the mock and a `tx` object so that the updated use case can be tested. Existing test cases must still pass (they will be updated in Task 4 to reference `tx`).

**File to change**: `src/payroll/use-cases/calculate-payroll.use-case.spec.ts`

**Steps**:

1. Add `$transaction: jest.fn()` to `prismaMock`.

2. Add a shared `tx` mock object (at describe-scope) with the following shape, matching the pattern in `employment-terminations.service.spec.ts`:

   ```typescript
   const tx = {
     payrollConceptDetail: {
       deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
       create: jest.fn().mockResolvedValue({ id: 'concept-1' }),
     },
     payrollItem: {
       deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
       create: jest.fn().mockResolvedValue({ id: 'item-1' }),
     },
     payrollPeriod: {
       update: jest.fn().mockResolvedValue({
         id: 'period-1',
         companyId: 'company-1',
         year: 2026,
         month: 12,
         payrollType: PayrollType.MONTHLY,
         status: PayrollStatus.CALCULATED,
       }),
     },
     auditLog: {
       create: jest.fn(),
     },
   };
   ```

3. In `beforeEach`, set up the default `$transaction` mock to execute the callback with `tx`:

   ```typescript
   prismaMock.$transaction.mockImplementation(
     async (callback) => callback(tx),
   );
   ```

4. Clear `tx.*` mocks in `beforeEach` alongside the existing `jest.clearAllMocks()`.

**Verification**:

- Run `npm test -- --testPathPattern="calculate-payroll.use-case.spec" --runInBand`.
- Existing tests may fail because they still assert on `prismaMock.payrollItem.create` which will move to `tx.payrollItem.create` in Task 4. That is expected. The goal here is that the file compiles and is syntactically valid.

---

## Task 3 — Refactor `CalculatePayrollUseCase` to use `$transaction`

**Goal**: wrap the persistence phase in a single `this.prisma.$transaction`. This is the core production code change.

**File to change**: `src/payroll/use-cases/calculate-payroll.use-case.ts`

### 3.1 Concept shape note

The calculators (e.g., `PayrollCalculatorService`) return concepts with the shape `{ code, name, type, amount }`. The `PayrollConceptDetail` table stores them as `conceptCode`, `conceptName`, `type`, `amount`. The mapping happens at persistence time — not in the intermediate data structure. The `CalculatedEmployeeResult` interface must use the calculator field names (`code`, `name`) and map to DB column names (`conceptCode`, `conceptName`) only inside the transaction write.

### 3.2 Introduce `CalculatedEmployeeResult` interface

At the top of the file (after imports), add:

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

### 3.3 Restructure `execute` into two phases

**Phase 1 — reads and calculations (outside transaction):**

Keep the following exactly as they are today:
- `payrollPeriod.findFirst` (status guard)
- Status validation logic
- `employee.findMany`
- Employee count guard
- `payrollPeriod.create` (if period does not exist)
- `payrollItem.findMany` (to collect `existingItemIds`)
- The per-employee loop: `payrollNovelty.findMany` + calculator dispatch

Instead of writing to the DB inside the loop, append to a `results: CalculatedEmployeeResult[]` array. Employees skipped by the calculator (SEVERANCE/BONUS with `accruedDays <= 0`) are simply not added to `results`, preserving the current skip behavior exactly.

**Phase 2 — persistence (inside transaction):**

```typescript
await this.prisma.$transaction(async (tx) => {
  // a) delete old concept details and items
  if (existingItemIds.length > 0) {
    await tx.payrollConceptDetail.deleteMany({
      where: { payrollItemId: { in: existingItemIds } },
    });
    await tx.payrollItem.deleteMany({
      where: { id: { in: existingItemIds } },
    });
  }

  // b) insert new items and concepts
  for (const result of results) {
    const payrollItem = await tx.payrollItem.create({
      data: {
        companyId: result.companyId,
        payrollPeriodId: result.payrollPeriodId,
        employeeId: result.employeeId,
        baseSalary: result.baseSalary,
        earnedTotal: result.earnedTotal,
        deductionsTotal: result.deductionsTotal,
        netPay: result.netPay,
      },
    });

    for (const concept of result.concepts) {
      await tx.payrollConceptDetail.create({
        data: {
          payrollItemId: payrollItem.id,
          conceptCode: concept.code,    // map: code → conceptCode
          conceptName: concept.name,    // map: name → conceptName
          type: concept.type,
          amount: concept.amount,
        },
      });
    }
  }

  // c) promote period status
  await tx.payrollPeriod.update({
    where: { id: period.id },
    data: { status: PayrollStatus.CALCULATED },
  });

  // d) audit — inside tx so it rolls back with the financial writes
  await this.auditService.log(
    {
      companyId,
      userId: currentUserId,
      action: 'CALCULATE_PAYROLL',
      entity: 'PayrollPeriod',
      entityId: period.id,
      newValue: { year, month, status: PayrollStatus.CALCULATED },
    },
    tx,
  );
});
```

**Return value**: `return period.id;` — unchanged.

### 3.4 Constraints

- Do not move `payrollPeriod.create` inside the transaction.
- Do not move any calculator call inside the transaction.
- Do not change the function signature of `execute`.
- Do not change the observable return behavior: execute must continue returning the payroll period id.
- Do not change any import that is not required by this refactor.

**Verification**:

- Run `npm test -- --testPathPattern="calculate-payroll.use-case.spec" --runInBand`.
- Tests will still fail because assertions still reference `prismaMock.*` for transactional writes. Fix in Task 4.

---

## Task 4 — Update `calculate-payroll.use-case.spec.ts` assertions

**Goal**: update existing test assertions to reflect that transactional writes now go through `tx` instead of `prismaMock`.

**File to change**: `src/payroll/use-cases/calculate-payroll.use-case.spec.ts`

**Steps**:

1. Replace all assertions on `prismaMock.payrollItem.create` with `tx.payrollItem.create`.
2. Replace all assertions on `prismaMock.payrollConceptDetail.create` with `tx.payrollConceptDetail.create`.
3. Replace all assertions on `prismaMock.payrollConceptDetail.deleteMany` with `tx.payrollConceptDetail.deleteMany`.
4. Replace all assertions on `prismaMock.payrollItem.deleteMany` with `tx.payrollItem.deleteMany`.
5. Replace all assertions on `prismaMock.payrollPeriod.update` with `tx.payrollPeriod.update`.
6. Assertions on `prismaMock.payrollPeriod.findFirst`, `prismaMock.payrollPeriod.create`, `prismaMock.employee.findMany`, `prismaMock.payrollNovelty.findMany` remain on `prismaMock` — they are outside the transaction.
7. Assert that `prismaMock.$transaction` was called (the transaction was opened).

**Verification**:

- Run `npm test -- --testPathPattern="calculate-payroll.use-case.spec" --runInBand`.
- All existing tests must pass.

---

## Task 5 — Add unit tests for transaction wiring and error propagation

**Goal**: prove at the unit level that all persistence writes use `tx`, that `auditService.log` receives `tx`, that mid-transaction errors propagate correctly, and that no persistence writes escape the transaction. These tests do **not** prove actual PostgreSQL rollback — that is covered by the E2E rollback tests in Task 9.

**Important scope constraint**: these unit tests must not claim to prove protection against concurrent calculate requests, calculate-vs-approve races, or stale novelty reads. Those belong to the separate `PayrollPeriod` concurrency feature.

**File to change**: `src/payroll/use-cases/calculate-payroll.use-case.spec.ts`

Add the following test cases (all within the existing `describe` block):

---

### Test U1 — Audit receives the same `tx` client on success

```
Scenario: normal successful calculation (same setup as existing MONTHLY test).

Assertions:
- auditServiceMock.log was called exactly once.
- auditServiceMock.log was called with the tx object as its second argument.
- auditServiceMock.log was called with action = 'CALCULATE_PAYROLL' and entity = 'PayrollPeriod'.
```

```typescript
expect(auditServiceMock.log).toHaveBeenCalledWith(
  expect.objectContaining({
    action: 'CALCULATE_PAYROLL',
    entity: 'PayrollPeriod',
    entityId: 'period-1',
  }),
  tx,
);
```

---

### Test U2 — All persistence writes use `tx`, not `prismaMock` directly

```
Scenario: normal successful calculation.

Assertions:
- tx.payrollItem.create was called (not prismaMock.payrollItem.create).
- tx.payrollConceptDetail.create was called (not prismaMock.payrollConceptDetail.create).
- tx.payrollPeriod.update was called (not prismaMock.payrollPeriod.update).
- prismaMock.payrollItem.create was NOT called.
- prismaMock.payrollConceptDetail.create was NOT called.
- prismaMock.payrollPeriod.update was NOT called.
```

---

### Test U3 — Transaction rejection propagates and audit is not called

```
Scenario:
- prismaMock.$transaction is made to reject (simulates the entire transaction failing,
  e.g., a database error before or during execution).

Implementation:
  prismaMock.$transaction.mockRejectedValueOnce(new Error('DB failure'));

Assertions:
- useCase.execute rejects with the DB error.
- auditServiceMock.log was NOT called.
```

Note: because `$transaction` rejects before the callback runs, none of the `tx.*` writes are called either. This test proves error propagation and that audit cannot be called outside the transaction boundary.

---

### Test U4 — Mid-loop failure: audit and status update are not reached

```
Scenario:
- $transaction runs its callback (not a full rejection).
- tx.payrollItem.create succeeds for the first employee, then rejects for a second.
- The callback throws, so $transaction propagates the error.

Implementation:
  prismaMock.$transaction.mockImplementationOnce(async (callback) => callback(tx));
  tx.payrollItem.create
    .mockResolvedValueOnce({ id: 'item-1' })
    .mockRejectedValueOnce(new Error('constraint violation'));

  // Set up two employees in prismaMock.employee.findMany for this test.

Assertions:
- useCase.execute rejects.
- tx.payrollPeriod.update was NOT called (execution stopped before it).
- auditServiceMock.log was NOT called (execution stopped before it).
```

This test proves that the status update and audit are positioned after the item-creation loop inside the transaction, so they cannot be reached if item creation fails.

---

### Test U5 — Guard before transaction: empty employee list never opens a transaction

```
Scenario:
- prismaMock.employee.findMany returns an empty array.

Assertions:
- useCase.execute rejects with BadRequestException.
- prismaMock.$transaction was NOT called.
```

This confirms the employee guard fires before the transaction is opened.

---

**Verification**:

- Run `npm test -- --testPathPattern="calculate-payroll.use-case.spec" --runInBand`.
- All tests (existing + U1–U5) must pass.

---

## Task 6 — Run full unit test suite

**Goal**: confirm no regression across all unit tests in the project.

**Command**:

```
npm test -- --runInBand
```

**Done when**: all tests pass with exit code 0. If an unrelated test fails, investigate and report the cause. Do not modify unrelated production code or tests without explicit approval.

---

## Task 7 — Validate schema and generate Prisma client

**Goal**: confirm that no schema change was accidentally introduced and that the Prisma client is up to date.

**Commands** (run in order):

```
npx prisma validate
npx prisma generate
```

**Done when**: both commands complete with exit code 0 and no warnings. No migration is created or run.

**Note**: this feature makes no changes to `prisma/schema.prisma`. If `prisma generate` produces a diff to the generated client, investigate before proceeding.

---

## Task 8 — Build

**Goal**: confirm TypeScript compilation succeeds after the refactor.

**Command**:

```
npm run build
```

**Done when**: compilation succeeds with exit code 0 and no TypeScript errors.

---

## Task 9 — E2E tests: happy path and real PostgreSQL rollback verification

**Goal**: confirm the happy-path payroll calculation flow is unaffected, and verify real PostgreSQL rollback behavior for both first-time and recalculation failure scenarios.

**Files to change**: `test/app.e2e-spec.ts` (rollback tests added in a new `describe` block or as additional `it` cases).

**Pre-condition**: PostgreSQL available, test data seeded. See `test/seed-test.ts`.

**Command**:

```
npm run test:e2e -- --runInBand
```

### 9.1 — Happy-path assertions (existing tests)

The E2E suite must cover a successful POST /payroll/calculate flow as part of this feature and verify that the transaction refactor does not alter successful calculation behavior.

- `POST /payroll/calculate` returns the same response shape.
- The payroll period transitions to `CALCULATED`.
- The audit log contains a `CALCULATE_PAYROLL` record.

### 9.2 — Real PostgreSQL rollback: approach

The E2E test suite already obtains `PrismaService` from the NestJS application via `app.get(PrismaService)`. The same mechanism can be used to obtain `AuditService`:

```typescript
const auditService = app.get(AuditService);
```

Because `auditService.log` is the **last** operation inside the `$transaction` callback, making it throw forces the Prisma transaction to reject after all financial writes (`PayrollItem`, `PayrollConceptDetail`, `PayrollPeriod.status`) have executed within the transaction — but before it commits. PostgreSQL then rolls back all of them atomically.

Injection approach:

```typescript
const spy = jest
  .spyOn(auditService, 'log')
  .mockRejectedValueOnce(new Error('forced rollback'));

// make the request — it must fail

spy.mockRestore(); // always restore immediately after
```

This does not modify production code or production behavior. The spy is scoped to one test and restored immediately.

**If this injection proves incompatible with the existing E2E architecture** (e.g., the NestJS module is compiled and the service cannot be spied on after compilation), document why and instead test rollback at the integration level using a dedicated test module that wires a real database. Do not invent workarounds that touch production code.

### 9.3 — E2E rollback test R1: first-time calculation failure

```
Setup:
- Create a fresh employee and a fresh payroll period (DRAFT, no prior items).
  Use year/month values unlikely to conflict with other tests (e.g., far-future year).
- Spy on auditService.log to reject once.

Request: POST /payroll/calculate for the new period.

Assertions (query the real database after the request):
- The HTTP response is an error (4xx or 5xx).
- PayrollPeriod.status is still DRAFT (or the period was just created in DRAFT and remains DRAFT).
- Zero PayrollItem rows exist for this period.
- Zero PayrollConceptDetail rows exist (indirectly — no PayrollItem means no concepts).
- Zero AuditLog rows with action = 'CALCULATE_PAYROLL' and entityId = the period's id.

Cleanup: delete the test employee and period in afterAll/afterEach.
```

### 9.4 — E2E rollback test R2: recalculation failure

```
Setup:
- Create a fresh employee.
- Run POST /payroll/calculate successfully to produce a CALCULATED period with known items.
- Snapshot: record the PayrollItem ids and amounts that were persisted.
- Spy on auditService.log to reject once.

Request: POST /payroll/calculate again for the same period (recalculation).

Assertions (query the real database after the request):
- The HTTP response is an error.
- The prior PayrollItem rows are still present and unmodified (ids and amounts match the snapshot).
- No new PayrollItem rows were added.
- PayrollPeriod.status is still CALCULATED (unchanged from the successful first calculation).
- No new AuditLog row with action = 'CALCULATE_PAYROLL' for the failed attempt
  (only the original successful audit record exists).

Cleanup: delete the test employee, payroll items, and period in afterAll/afterEach.
```

### 9.5 — Scope constraint

These E2E tests prove that the transaction rolls back atomically on real PostgreSQL. They do **not** test or prove:

- two simultaneous calculate requests serializing correctly;
- a calculate request racing with an approve/close request;
- novelty-read staleness.

Those belong to the separate `PayrollPeriod` concurrency feature.

**Done when**: all E2E tests (existing + R1 + R2) pass with exit code 0.

---

## Task 10 — Final diff check and review gate

**Goal**: confirm expected files changed, no unexpected production files changed, and no schema/migration/package changes were introduced.

**Commands**:

```
git diff --check
git status
```

**What to verify**:

1. `git diff --check` exits 0 (no trailing whitespace or line-ending issues).
2. The following production source files changed — verify each is present:
   - `src/payroll/use-cases/calculate-payroll.use-case.ts`
3. The following test files changed — verify each is present:
   - `src/payroll/use-cases/calculate-payroll.use-case.spec.ts`
   - `test/app.e2e-spec.ts` (if E2E rollback tests were added)
4. The following files must **not** appear as modified:
   - `prisma/schema.prisma`
   - `package.json`
   - `package-lock.json`
   - Any file under `src/` other than the two use case files listed above.
5. Kiro spec and steering files (`.kiro/specs/`, `.kiro/steering/`, `.kiroignore`) may appear in `git status` if edited during planning. They are not production files and do not need to be reverted. Do not automatically revert them.
6. If any unexpected production file appears modified, investigate and revert with explicit approval before committing.

**Done when**: the above checks pass and the change set is exactly what was planned.

---

## Summary

### What changed from the previous version of tasks.md

1. **Task 1**: removed "document in a code comment or scratch note"; replaced with "report findings in chat". No repository changes of any kind.
2. **`CalculatedEmployeeResult` interface (Task 3)**: corrected concepts to use `{ code, name, type, amount }` — the actual calculator output shape — not `{ conceptCode, conceptName, type, amount }` (those are DB column names). The mapping to DB column names happens inside the transaction write at persistence time.
3. **Task 5 (rollback tests)**: completely rewritten. Separated into five focused unit tests (U1–U5) with consistent names. Removed the claim that mocked tests prove PostgreSQL rollback. Explicitly stated these tests prove wiring and error propagation only. Added scope constraint: tests must not claim to prove concurrency protection.
4. **Task 9 (E2E)**: added real PostgreSQL rollback tests R1 and R2 using `auditService.log` spy injection. Documented the injection approach, fallback if incompatible, and explicit scope constraint (not concurrent-request tests).
5. **Task 6**: replaced "investigate and fix before proceeding" with "investigate and report the cause; do not modify unrelated code without explicit approval."
6. **Task 10**: replaced the exact two-file `git status` expectation with a category-based check. Kiro spec/steering files are explicitly allowed and must not be auto-reverted.
7. **Summary section**: updated files-expected-to-change, removed `test/app.e2e-spec.ts` from "must not change", added internal consistency note about `design.md`.

### Final ordered task list

| # | Task |
|---|---|
| 1 | Understand current test structure (chat only, no repo changes) |
| 2 | Add `$transaction` + `tx` mock infrastructure to spec |
| 3 | Refactor `CalculatePayrollUseCase` to use `$transaction` |
| 4 | Update spec assertions to reference `tx.*` |
| 5 | Add unit tests U1–U5 (wiring, error propagation) |
| 6 | Run full unit test suite |
| 7 | Validate schema + generate Prisma client |
| 8 | Build |
| 9 | E2E happy-path + rollback tests R1 and R2 |
| 10 | Final diff check and review gate |

### Repository files expected to change during implementation

| File | Nature of change |
|---|---|
| `src/payroll/use-cases/calculate-payroll.use-case.ts` | Introduce `CalculatedEmployeeResult`; two-phase refactor; `$transaction` wrapping persistence; `tx` passed to `auditService.log` |
| `src/payroll/use-cases/calculate-payroll.use-case.spec.ts` | Add `$transaction` mock; add `tx` sub-mock; update assertions; add unit tests U1–U5 |
| `test/app.e2e-spec.ts` | Add E2E rollback tests R1 and R2 |

### Files that must not change

| File | Reason |
|---|---|
| `src/audit/audit.service.ts` | Already supports `tx`; no change needed |
| `src/payroll/payroll-calculator.service.ts` | Pure calculator; not involved |
| `src/payroll/calculator/**/*.ts` | All pure calculators; not involved |
| `src/payroll/payroll.service.ts` | Thin facade; not involved |
| `src/payroll/payroll.controller.ts` | API contract unchanged |
| `src/payroll/payroll.module.ts` | DI wiring unchanged |
| `src/payroll/use-cases/approve-payroll-period.use-case.ts` | Out of scope |
| `src/payroll/use-cases/close-payroll-period.use-case.ts` | Out of scope |
| `src/payroll/use-cases/reopen-payroll-period.use-case.ts` | Out of scope |
| `src/payroll/use-cases/create-payroll-period.use-case.ts` | Out of scope |
| `src/employment-terminations/**` | Not involved |
| `prisma/schema.prisma` | No schema changes |
| `package.json` / `package-lock.json` | No new dependencies |

### Main implementation risk

The refactored loop iterates `results` (a pre-built in-memory array) inside the transaction rather than iterating employees with interleaved reads and writes. If any field of `CalculatedEmployeeResult` is omitted when building the array (e.g., `companyId` not forwarded), `payrollItem.create` inside the transaction will receive incomplete data and fail at runtime. This is caught by:

1. TypeScript compilation (the interface makes all required fields explicit).
2. The updated unit tests (they assert on the exact shape of `tx.payrollItem.create` call arguments).
3. The E2E tests (they verify actual database records for a real calculation).

### Note: discrepancy between tasks.md and design.md on `CalculatedEmployeeResult`

`design.md` section 3 describes the interface with concept fields `code` and `name`. That is correct and consistent with the calculator output. `tasks.md` previously proposed `conceptCode` and `conceptName` — the DB column names — which was wrong. The correction in this revision aligns `tasks.md` with `design.md`. **No change to `design.md` is required.**

### Scope constraint: what rollback tests must not claim to prove

The unit tests (Task 5) and E2E rollback tests (Task 9) prove only:

- each individual calculation attempt is all-or-nothing at the database level;
- persistence writes use `tx` and not the outer `prisma` client;
- `auditService.log` is called inside the transaction.

They do **not** prove and must not be described as proving:

- two simultaneous calculate requests produce a safe final state;
- a concurrent calculate cannot overwrite an APPROVED or CLOSED period;
- novelties read before the transaction cannot be stale at persistence time.

Those guarantees belong to the separate `PayrollPeriod` concurrency feature.
