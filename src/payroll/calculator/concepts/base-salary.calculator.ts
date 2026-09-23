import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class BaseSalaryCalculator {
  calculate(baseSalary: Decimal, workedDays: Decimal) {
    const amount = baseSalary.dividedBy(30).times(workedDays);

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
