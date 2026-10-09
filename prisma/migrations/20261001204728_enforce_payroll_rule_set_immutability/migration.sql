-- Published payroll rule sets are immutable historical snapshots.
CREATE OR REPLACE FUNCTION "prevent_published_payroll_rule_set_mutation"()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."status" = 'PUBLISHED'::"PayrollRuleSetStatus" THEN
        RAISE EXCEPTION 'Published PayrollRuleSet rows are immutable';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayrollRuleSet_prevent_published_mutation"
BEFORE UPDATE OR DELETE ON "PayrollRuleSet"
FOR EACH ROW
EXECUTE FUNCTION "prevent_published_payroll_rule_set_mutation"();