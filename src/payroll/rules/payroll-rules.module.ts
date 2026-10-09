import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PayrollRuleSetDraftCreationService } from './payroll-rule-set-draft-creation.service';
import { PayrollRuleSetDraftEditingService } from './payroll-rule-set-draft-editing.service';
import { PayrollRuleSetPublicationService } from './payroll-rule-set-publication.service';
import { PayrollRuleSetQueryService } from './payroll-rule-set-query.service';
import { PlatformPayrollRuleSetsController } from './platform-payroll-rule-sets.controller';
import { PayrollRuleSetSelectionPolicy } from './payroll-rule-set-selection.policy';
import { PayrollRulesResolver } from './payroll-rules-resolver';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [PlatformPayrollRuleSetsController],
  providers: [
    PayrollRuleSetDraftCreationService,
    PayrollRuleSetDraftEditingService,
    PayrollRulesResolver,
    PayrollRuleSetSelectionPolicy,
    PayrollRuleSetPublicationService,
    PayrollRuleSetQueryService,
  ],
  exports: [
    PayrollRulesResolver,
    PayrollRuleSetSelectionPolicy,
    PayrollRuleSetPublicationService,
  ],
})
export class PayrollRulesModule {}
