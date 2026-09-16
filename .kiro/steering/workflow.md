# Nómina360 Development Workflow

Make small, reviewable changes.

## Before modifying code

1. Understand the existing implementation.
2. Inspect relevant tests.
3. Identify affected modules.
4. Explain the intended change.
5. Avoid unrelated refactors.

## After modifying code

Run the relevant targeted tests first.

Before considering a significant backend change complete, run:

npx prisma generate
npx prisma validate
npm test -- --runInBand
npm run build
npm run test:e2e -- --runInBand

When applicable also run:

git diff --check
git status

## Git

Do not automatically:

- commit
- push
- force push
- reset
- rebase
- delete branches

unless explicitly requested.

The human decides when a checkpoint is ready for commit.

## Changes

Prefer:

one problem
→ one focused implementation
→ tests
→ review
→ commit

Do not modify unrelated files just to clean them up.

## AI behavior

When asked to implement a feature:

1. inspect current architecture
2. present the proposed impact
3. preserve existing behavior
4. implement the smallest complete solution
5. add/update tests
6. run validation
7. summarize exactly what changed

Do not claim a test passed unless it was actually executed.