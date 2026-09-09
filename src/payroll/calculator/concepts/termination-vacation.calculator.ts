import { Injectable } from '@nestjs/common';
import { ConceptType } from '@prisma/client';

interface PayrollConcept {
  code: string;
  name: string;
  type: ConceptType;
  amount: number;
}

@Injectable()
export class TerminationVacationCalculator {
  calculate(baseSalary: number, pendingVacationDays: number) {
    if (baseSalary <= 0 || pendingVacationDays <= 0) {
      return {
        earned: 0,
        concepts: [] as PayrollConcept[],
      };
    }

    const dailySalary = baseSalary / 30;
    const amount = dailySalary * pendingVacationDays;

    return {
      earned: amount,
      concepts: [
        {
          code: 'TERMINATION_VACATION',
          name: 'Vacaciones pendientes',
          type: ConceptType.EARNING,
          amount,
        },
      ] as PayrollConcept[],
    };
  }
}
