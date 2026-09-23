import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PayrollCalculationResult } from '../money/payroll-money.types';
import { ServiceBonusCalculator } from './concepts/service-bonus.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';

interface ServiceBonusPayrollInput {
  baseSalary: Decimal;
  accruedDays: number;
}

@Injectable()
export class ServiceBonusPayrollCalculator {
  constructor(
    private readonly serviceBonusCalculator: ServiceBonusCalculator,
    private readonly transportAllowanceCalculator: TransportAllowanceCalculator,
  ) {}

  calculate(input: ServiceBonusPayrollInput): PayrollCalculationResult {
    const transportAllowanceResult =
      this.transportAllowanceCalculator.calculate(
        input.baseSalary,
        new Decimal(30),
      );

    const serviceBonusResult = this.serviceBonusCalculator.calculate(
      input.baseSalary,
      input.accruedDays,
      transportAllowanceResult.earned,
    );

    return {
      earnedTotal: serviceBonusResult.earned,
      deductionsTotal: new Decimal(0),
      netPay: serviceBonusResult.earned,
      concepts: serviceBonusResult.concepts,
    };
  }
}
