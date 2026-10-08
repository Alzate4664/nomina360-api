ALTER TABLE "PayrollRuleSet"
ADD COLUMN "draftRevision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PayrollRuleSet"
ADD CONSTRAINT "PayrollRuleSet_draft_revision_check"
CHECK ("draftRevision" >= 1);
