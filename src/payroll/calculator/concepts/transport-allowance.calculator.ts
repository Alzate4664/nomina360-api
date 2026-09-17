import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PayrollConceptAmount } from '../../money/payroll-money.types';
import { PAYROLL_RATES } from '../config/payroll-rates.config';

@Injectable()
export class TransportAllowanceCalculator {
  calculate(baseSalary: Decimal, workedDays: Decimal) {
    const salaryLimit = new Decimal(PAYROLL_RATES.minimumWage).times(
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages,
    );

    if (baseSalary.gt(salaryLimit) || workedDays.lte(0)) {
      return {
        earned: new Decimal(0),
        concepts: [] as PayrollConceptAmount[],
      };
    }

    const eligibleDays = Decimal.min(workedDays, 30);

    const amount = new Decimal(PAYROLL_RATES.transportAllowance.monthlyAmount)
      .dividedBy(30)
      .times(eligibleDays)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    const concepts: PayrollConceptAmount[] = [
      {
        code: 'TRANSPORT_ALLOWANCE',
        name: 'Auxilio de transporte',
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
