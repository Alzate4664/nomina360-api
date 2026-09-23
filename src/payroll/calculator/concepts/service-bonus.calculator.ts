import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PAYROLL_RATES } from '../config/payroll-rates.config';
import { PayrollConceptAmount } from '../../money/payroll-money.types';

@Injectable()
export class ServiceBonusCalculator {
  calculate(
    baseSalary: Decimal,
    accruedDays: number,
    transportAllowance: Decimal = new Decimal(0),
  ) {
    if (accruedDays <= 0) {
      return {
        earned: new Decimal(0),
        concepts: [] as PayrollConceptAmount[],
      };
    }

    const calculationBase = baseSalary.plus(transportAllowance);

    const amount = calculationBase
      .times(accruedDays)
      .dividedBy(PAYROLL_RATES.serviceBonus.daysPerYear);

    return {
      earned: amount,
      concepts: [
        {
          code: 'SERVICE_BONUS',
          name: 'Prima de servicios',
          type: ConceptType.EARNING,
          amount,
        },
      ] as PayrollConceptAmount[],
    };
  }
}
