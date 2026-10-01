import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

interface TransportAllowanceCalculationRules {
  readonly minimumWage: Decimal;

  readonly transportAllowance: {
    readonly monthlyAmount: Decimal;
    readonly salaryLimitInMinimumWages: Decimal;
    readonly monthlyProrationDayBasis: number;
  };
}

@Injectable()
export class TransportAllowanceCalculator {
  calculate(
    baseSalary: Decimal,
    workedDays: Decimal,
    rules: TransportAllowanceCalculationRules,
  ) {
    const salaryLimit = rules.minimumWage.times(
      rules.transportAllowance.salaryLimitInMinimumWages,
    );

    if (baseSalary.gt(salaryLimit) || workedDays.lte(0)) {
      return {
        earned: new Decimal(0),
        concepts: [] as PayrollConceptAmount[],
      };
    }

    const eligibleDays = Decimal.min(
      workedDays,
      rules.transportAllowance.monthlyProrationDayBasis,
    );

    const amount = rules.transportAllowance.monthlyAmount
      .dividedBy(rules.transportAllowance.monthlyProrationDayBasis)
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
