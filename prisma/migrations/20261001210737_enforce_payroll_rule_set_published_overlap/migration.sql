-- Support equality comparisons for scalar types inside GiST exclusion constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- At most one published payroll rule set may cover a business date
-- for the same jurisdiction.
ALTER TABLE "PayrollRuleSet"
ADD CONSTRAINT "PayrollRuleSet_published_effective_range_excl"
EXCLUDE USING gist (
    "jurisdictionCode" WITH =,
    daterange("effectiveFrom", "effectiveTo", '[)') WITH &&
)
WHERE ("status" = 'PUBLISHED'::"PayrollRuleSetStatus");