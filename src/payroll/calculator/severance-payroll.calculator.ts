import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { SeveranceCalculator } from './concepts/severance.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';
import { PayrollCalculationResult } from '../money/payroll-money.types';

interface SeverancePayrollInput {
  baseSalary: Decimal;
  accruedDays: number;
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
        new Decimal(30),
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
