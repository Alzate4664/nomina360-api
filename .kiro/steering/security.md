# Nómina360 Security Rules

Security-sensitive changes require explicit review.

## Secrets

Never:

- expose environment variables
- print JWT_SECRET
- commit credentials
- commit database URLs
- commit API keys
- read or modify protected secret files

## Authentication

JWT configuration must come from validated environment configuration.

Never introduce fallback secrets.

Never use insecure default secrets.

## Multi-tenancy

Every company-owned resource must maintain tenant isolation.

Never trust a companyId supplied by a client when the authenticated user's company context should determine ownership.

## Dependencies

Do not run:

npm audit fix --force

without explicit human authorization.

Do not downgrade critical dependencies solely to silence npm audit.

Security fixes should be incremental and regression tested.

## Database

Do not execute destructive database operations without explicit approval.

Never run commands equivalent to:

DROP DATABASE
prisma migrate reset
TRUNCATE production data

## Sensitive payroll data

Treat employee payroll information as confidential.

Never include real employee or production payroll data in generated examples.