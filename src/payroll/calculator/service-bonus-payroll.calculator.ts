import { Injectable } from '@nestjs/common';
import { ServiceBonusCalculator } from './concepts/service-bonus.calculator';
import { TransportAllowanceCalculator } from './concepts/transport-allowance.calculator';

interface ServiceBonusPayrollInput {
  baseSalary: number;
  accruedDays: number;
}

@Injectable()
export class ServiceBonusPayrollCalculator {
  constructor(
    private readonly serviceBonusCalculator: ServiceBonusCalculator,
    private readonly transportAllowanceCalculator: TransportAllowanceCalculator,
  ) {}

  calculate(input: ServiceBonusPayrollInput) {
    const transportAllowanceResult =
      this.transportAllowanceCalculator.calculate(input.baseSalary, 30);

    const serviceBonusResult = this.serviceBonusCalculator.calculate(
      input.baseSalary,
      input.accruedDays,
      transportAllowanceResult.earned,
    );

    return {
      earnedTotal: serviceBonusResult.earned,
      deductionsTotal: 0,
      netPay: serviceBonusResult.earned,
      concepts: serviceBonusResult.concepts,
    };
  }
}
