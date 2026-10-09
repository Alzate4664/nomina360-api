-- Payroll rule set publication metadata must remain internally consistent.
ALTER TABLE "PayrollRuleSet"
ADD CONSTRAINT "PayrollRuleSet_publication_metadata_check"
CHECK (
    (
        "status" = 'DRAFT'::"PayrollRuleSetStatus"
        AND "publishedAt" IS NULL
    )
    OR
    (
        "status" = 'PUBLISHED'::"PayrollRuleSetStatus"
        AND "publishedAt" IS NOT NULL
    )
);

-- Jurisdictions currently use uppercase ISO-like alpha-2 country codes.
ALTER TABLE "PayrollRuleSet"
ADD CONSTRAINT "PayrollRuleSet_jurisdiction_code_check"
CHECK ("jurisdictionCode" ~ '^[A-Z]{2}$');