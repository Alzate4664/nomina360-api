import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PayrollRuleSetPublicationService } from './payroll-rule-set-publication.service';
import { PayrollRuleSetSelectionPolicy } from './payroll-rule-set-selection.policy';
import { PayrollRulesResolver } from './payroll-rules-resolver';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    PayrollRulesResolver,
    PayrollRuleSetSelectionPolicy,
    PayrollRuleSetPublicationService,
  ],
  exports: [
    PayrollRulesResolver,
    PayrollRuleSetSelectionPolicy,
    PayrollRuleSetPublicationService,
  ],
})
export class PayrollRulesModule {}
