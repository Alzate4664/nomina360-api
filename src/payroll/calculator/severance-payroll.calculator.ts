import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { SeveranceCalculator } from './concepts/severance.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';
import { PayrollCalculationResult } from '../money/payroll-money.types';
import { PayrollRules } from '../rules/payroll-rules';

interface SeverancePayrollInput {
  baseSalary: Decimal;
  accruedDays: number;
  rules: PayrollRules;
}

type SeverancePayrollResult = PayrollCalculationResult & {
  severanceBase: Decimal;
};

@Injectable()
export class SeverancePayrollCalculator {
  constructor(
    private readonly severanceCalculator: SeveranceCalculator,
    private readonly transportAllowanceCalculator: TransportAllowanceCalculator,
  ) {}

  calculate(input: SeverancePayrollInput): SeverancePayrollResult {
    const transportAllowanceResult =
      this.transportAllowanceCalculator.calculate(
        input.baseSalary,
        new Decimal(input.rules.transportAllowance.monthlyProrationDayBasis),
        {
          minimumWage: input.rules.minimumWage,
          transportAllowance: input.rules.transportAllowance,
        },
      );

    const severanceBase = input.baseSalary.plus(
      transportAllowanceResult.earned,
    );

    const severanceResult = this.severanceCalculator.calculate({
      severanceBase,
      accruedDays: input.accruedDays,
    });

    return {
      severanceBase,
      earnedTotal: severanceResult.total,
      deductionsTotal: new Decimal(0),
      netPay: severanceResult.total,
      concepts: severanceResult.concepts,
    };
  }
}
