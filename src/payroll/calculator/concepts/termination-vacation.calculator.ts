import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class TerminationVacationCalculator {
  calculate(baseSalary: Decimal, pendingVacationDays: number) {
    if (baseSalary.lte(0) || pendingVacationDays <= 0) {
      return {
        earned: new Decimal(0),
        concepts: [] as PayrollConceptAmount[],
      };
    }

    const dailySalary = baseSalary.dividedBy(30);
    const amount = dailySalary.times(pendingVacationDays);

    return {
      earned: amount,
      concepts: [
        {
          code: 'TERMINATION_VACATION',
          name: 'Vacaciones pendientes',
          type: ConceptType.EARNING,
          amount,
        },
      ] as PayrollConceptAmount[],
    };
  }
}
