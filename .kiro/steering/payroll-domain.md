# Nómina360 Payroll Domain

Payroll logic is financially and legally sensitive.

## Rules

Never invent Colombian payroll rules.

If a legal or payroll rule is uncertain or time-dependent:

1. identify the uncertainty
2. request or consult an official source
3. do not silently assume a value
4. keep legal configuration explicit and testable

Money must use Decimal-compatible arithmetic.

## Payroll lifecycle

PayrollPeriod follows controlled state transitions such as:

DRAFT
→ CALCULATED
→ APPROVED
→ CLOSED

A CLOSED period may be explicitly reopened:

CLOSED
→ REOPENED
→ CALCULATED

Reopening must be explicit and auditable.

## Employment termination

EmploymentTermination is a separate domain entity from PayrollPeriod.

Lifecycle:

DRAFT
→ CALCULATED
→ APPROVED
→ CLOSED

An employee must only become INACTIVE when the termination is CLOSED.

Termination calculations must remain auditable.

## Concurrency

Financial state transitions must consider concurrent requests.

Use transactions and/or optimistic concurrency where appropriate.

Never assume two requests cannot operate on the same financial entity simultaneously.

## Auditability

Important financial operations should record:

- company
- user
- action
- entity
- entity id
- previous state/value
- resulting state/value