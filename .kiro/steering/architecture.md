# Nómina360 Backend Architecture

## Stack

- NestJS
- TypeScript
- Prisma
- PostgreSQL
- JWT authentication
- Jest
- Docker
- GitHub Actions
- Render

## Architecture principles

Prefer:

- clear module boundaries
- services with explicit responsibilities
- reusable domain calculators
- transaction-safe financial operations
- explicit state transitions
- auditable business operations
- DTO validation
- tenant isolation by companyId
- deterministic payroll calculations

Avoid:

- duplicated business rules
- financial logic inside controllers
- direct database operations from controllers
- hidden state transitions
- magic numbers for payroll rates
- floating-point arithmetic for money
- destructive migrations without explicit review
- large rewrites when a focused change is possible

## Prisma

Never modify schema.prisma without considering:

- migration requirements
- existing production data
- indexes
- uniqueness constraints
- relations
- backward compatibility

Do not run destructive Prisma commands automatically.

Never execute:

- prisma migrate reset
- database drops
- destructive migrations

without explicit human authorization.