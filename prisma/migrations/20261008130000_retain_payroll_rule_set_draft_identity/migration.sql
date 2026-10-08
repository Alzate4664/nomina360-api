-- Retain DRAFT identities from deployment onward; no existing rows are changed.
CREATE FUNCTION "prevent_draft_payroll_rule_set_identity_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."status" = 'DRAFT'::"PayrollRuleSetStatus" THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Draft PayrollRuleSet rows cannot be deleted';
        END IF;

        IF OLD."id" IS DISTINCT FROM NEW."id"
            OR OLD."jurisdictionCode" IS DISTINCT FROM NEW."jurisdictionCode"
            OR OLD."version" IS DISTINCT FROM NEW."version" THEN
            RAISE EXCEPTION 'Draft PayrollRuleSet identity is immutable';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayrollRuleSet_prevent_draft_identity_mutation"
BEFORE UPDATE OR DELETE ON "PayrollRuleSet"
FOR EACH ROW
EXECUTE FUNCTION "prevent_draft_payroll_rule_set_identity_mutation"();
