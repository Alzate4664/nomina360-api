import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class BaseSalaryCalculator {
  calculate(baseSalary: Decimal, workedDays: Decimal, monthlyDayBasis: number) {
    const amount = baseSalary.dividedBy(monthlyDayBasis).times(workedDays);

    const concepts: PayrollConceptAmount[] = [
      {
        code: 'BASE_SALARY',
        name: 'Salario ordinario',
        type: ConceptType.EARNING,
        amount,
      },
    ];

    return {
      earned: amount,
      concepts,
    };
  }
}
