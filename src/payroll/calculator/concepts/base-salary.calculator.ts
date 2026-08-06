import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';

@Injectable()
export class BaseSalaryCalculator {
  calculate(baseSalary: number, workedDays: number) {
    const earned = (baseSalary / 30) * workedDays;

    return {
      earned,

      concepts: [
        {
          code: 'BASE_SALARY',
          name: 'Salario ordinario',
          type: ConceptType.EARNING,
          amount: earned,
        },
      ],
    };
  }
}
