import { Injectable } from '@nestjs/common';
import { SeveranceCalculator } from './concepts/severance.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';

interface SeverancePayrollInput {
  baseSalary: number;
  accruedDays: number;
}

@Injectable()
export class SeverancePayrollCalculator {
  constructor(
    private readonly severanceCalculator: SeveranceCalculator,
    private readonly transportAllowanceCalculator: TransportAllowanceCalculator,
  ) {}

  calculate(input: SeverancePayrollInput) {
    const transportAllowanceResult =
      this.transportAllowanceCalculator.calculate(input.baseSalary, 30);

    const severanceBase = input.baseSalary + transportAllowanceResult.earned;

    const severanceResult = this.severanceCalculator.calculate({
      severanceBase,
      accruedDays: input.accruedDays,
    });

    return {
      severanceBase,
      earnedTotal: severanceResult.total,
      deductionsTotal: 0,
      netPay: severanceResult.total,
      concepts: severanceResult.concepts,
    };
  }
}
