# Nómina360 repository instructions

## Product context

Nómina360 is a commercial Colombian payroll SaaS product.
Treat it as production software, not as an academic exercise.

Primary goals:
- financial correctness
- tenant isolation
- security
- auditability
- maintainability
- scalability without premature complexity
- clear UX
- reliable production operation

Current architecture:
- NestJS modular monolith
- Prisma
- PostgreSQL
- JWT authentication
- React frontend in a separate repository

Do not introduce microservices, Kafka, Kubernetes, CQRS, event sourcing, Redis, or other distributed infrastructure unless the task provides clear evidence that it is required.

## Financial and payroll safety

Payroll code is high risk.

- Never use floating-point arithmetic for money or payroll quantities where Decimal is already used.
- Preserve Prisma Decimal / decimal-safe arithmetic across payroll calculations.
- Do not introduce Colombian payroll percentages, thresholds, legal values, or dates as hardcoded constants.
- Payroll/legal parameters must flow through the versioned PayrollRuleSet architecture.
- DEFAULT_PAYROLL_RULES is compatibility/test infrastructure, not verified legal truth.
- Never claim a payroll rule is legally correct unless the task provides an authoritative source and explicit validation requirement.
- Recalculations must preserve historical rule-set determinism where the existing design requires it.
- Avoid silent rounding, implicit number casts, or arithmetic changes.

## Multi-tenancy and authorization

Tenant isolation is mandatory.

Tenant roles:
- OWNER
- ADMIN
- ACCOUNTANT
- VIEWER

Platform role:
- SUPER_ADMIN

Rules:
- SUPER_ADMIN must have companyId = null.
- Tenant users must have a non-null companyId.
- Never weaken TenantScopeGuard, PlatformScopeGuard, RolesGuard, or database scope invariants.
- Do not add a platform role to tenant DTOs or tenant role assignment flows.
- Never trust a companyId supplied by a client when the authenticated tenant identity already defines the tenant scope.
- New tenant queries must be reviewed for company scoping.
- Cross-tenant access is a security defect.

## Database and Prisma

- Do not edit migrations that have already been applied.
- Create a new migration for schema changes.
- Never run destructive database commands without explicit user approval.
- Never reset, drop, truncate, or recreate a database unless explicitly requested.
- Never run production migrations or seeds unless explicitly requested.
- Preserve transactional boundaries for payroll, audit, publication, and other atomic operations.
- Prefer database invariants when an invariant must hold regardless of application code.

## Git safety

- Never run `git add .`.
- Never commit, push, merge, rebase, reset, force-push, delete branches, or modify remote history unless explicitly instructed.
- Do not switch branches unless explicitly instructed.
- Do not modify unrelated files.
- Keep changes small and reviewable.
- Before editing, inspect `git status --short`.
- If the working tree is unexpectedly dirty, stop and report it.
- Do not overwrite user changes.

## Change discipline

Before implementing a change:
1. inspect the relevant code and tests;
2. identify the smallest coherent slice;
3. preserve existing architectural boundaries;
4. avoid speculative abstractions.

For security, payroll, database, migrations, authentication, authorization, and financial calculations:
- explain the intended change before modifying code when the task is ambiguous;
- prefer the smallest safe implementation;
- add or update focused tests.

Do not refactor unrelated code while completing a task.

## Verification

For changed TypeScript files, use targeted formatting and linting.

Typical checks:
- relevant unit tests
- relevant E2E tests when behavior crosses HTTP/database boundaries
- `npm run build`
- `git diff --check`

Before declaring a substantial backend slice ready, run the broader test suite when practical.

Known E2E tests intentionally force audit failures to verify transaction rollback.
Nest ERROR logs from those tests are acceptable only when the Jest suites still PASS.

Do not hide, disable, weaken, or delete failing tests merely to make a task pass.

## Secrets and production

- Never print, commit, expose, or copy passwords, hashes, JWT secrets, database credentials, API keys, tokens, or production secrets.
- Do not add real credentials to `.env`, source files, tests, logs, examples, or documentation.
- Do not access or mutate production systems unless explicitly instructed.
- Operational bootstrap credentials must come from environment variables or approved secret-management mechanisms.

## Working style

When asked to implement:
- inspect first;
- make the minimum coherent change;
- run the appropriate verification;
- summarize exactly what changed, what was tested, and any remaining risk.

If a requirement is unclear and could affect payroll correctness, security, database integrity, or backwards compatibility, stop and ask instead of guessing.
