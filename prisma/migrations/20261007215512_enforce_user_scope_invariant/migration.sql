-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_companyId_fkey";

-- AddForeignKey
ALTER TABLE "User"
ADD CONSTRAINT "User_companyId_fkey"
FOREIGN KEY ("companyId")
REFERENCES "Company"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- EnforceUserScopeInvariant
ALTER TABLE "User"
ADD CONSTRAINT "User_role_company_scope_check"
CHECK (
  (
    "role" = 'SUPER_ADMIN'
    AND "companyId" IS NULL
  )
  OR
  (
    "role" IN ('OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER')
    AND "companyId" IS NOT NULL
  )
);