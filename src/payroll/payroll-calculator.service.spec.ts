import { PayrollDayType, SickLeaveOrigin } from '@prisma/client';
import { PAYROLL_RATES } from './calculator/config/payroll-rates.config';
import { AbsenceCalculator } from './calculator/concepts/absence.calculator';
import { BaseSalaryCalculator } from './calculator/concepts/base-salary.calculator';
import { BonusCalculator } from './calculator/concepts/bonus.calculator';
import { DeductionCalculator } from './calculator/concepts/deduction.calculator';
import { HealthCalculator } from './calculator/concepts/health.calculator';
import { NightSurchargeCalculator } from './calculator/concepts/night-surcharge.calculator';
import { OvertimeCalculator } from './calculator/concepts/overtime.calculator';
import { PensionCalculator } from './calculator/concepts/pension.calculator';
import { SickLeaveCalculator } from './calculator/concepts/sick-leave.calculator';
import { SundayHolidayCalculator } from './calculator/concepts/sunday-holiday.calculator';
import { TransportAllowanceCalculator } from './calculator/concepts/transport-allowance.calculator';
import { PayrollCalculatorService } from './payroll-calculator.service';

describe('PayrollCalculatorService', () => {
  let calculator: PayrollCalculatorService;

  beforeEach(() => {
    calculator = new PayrollCalculatorService(
      new BaseSalaryCalculator(),
      new BonusCalculator(),
      new AbsenceCalculator(),
      new DeductionCalculator(),
      new HealthCalculator(),
      new PensionCalculator(),
      new OvertimeCalculator(),
      new NightSurchargeCalculator(),
      new SundayHolidayCalculator(),
      new TransportAllowanceCalculator(),
      new SickLeaveCalculator(),
    );
  });

  it('should include transport allowance in earned total but exclude it from health and pension base', () => {
    const baseSalary = PAYROLL_RATES.minimumWage;

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [],
    });

    const expectedTransportAllowance =
      PAYROLL_RATES.transportAllowance.monthlyAmount;

    const expectedHealth = baseSalary * 0.04;
    const expectedPension = baseSalary * 0.04;

    expect(result.earnedTotal).toBe(baseSalary + expectedTransportAllowance);

    expect(result.deductionsTotal).toBe(expectedHealth + expectedPension);

    expect(result.netPay).toBe(
      baseSalary +
        expectedTransportAllowance -
        expectedHealth -
        expectedPension,
    );
  });

  it('should exclude sick leave days from ordinary salary and transport allowance', () => {
    const baseSalary = 3000000;

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [
        {
          id: 'novelty-1',
          companyId: 'company-1',
          employeeId: 'employee-1',
          payrollPeriodId: 'period-1',
          type: 'SICK_LEAVE',
          dayType: PayrollDayType.REGULAR,
          sickLeaveOrigin: SickLeaveOrigin.WORK_ACCIDENT,
          sickLeaveStartDay: 1,
          sickLeaveIbc: 3000000,
          quantity: 3,
          amount: null,
          description: 'Incapacidad laboral de 3 días',
          createdAt: new Date(),
        },
      ],
    });

    const expectedOrdinarySalary = 2700000;
    const expectedSickLeave = 300000;

    const expectedTransportAllowance = Math.round(
      (PAYROLL_RATES.transportAllowance.monthlyAmount / 30) * 27,
    );

    const expectedContributionBase = expectedOrdinarySalary + expectedSickLeave;

    const expectedHealth = expectedContributionBase * 0.04;
    const expectedPension = expectedContributionBase * 0.04;

    const expectedEarnedTotal =
      expectedContributionBase + expectedTransportAllowance;

    const expectedDeductions = expectedHealth + expectedPension;

    expect(result.earnedTotal).toBe(expectedEarnedTotal);

    expect(result.deductionsTotal).toBe(expectedDeductions);

    expect(result.netPay).toBe(expectedEarnedTotal - expectedDeductions);

    expect(result.concepts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'BASE_SALARY',
          amount: expectedOrdinarySalary,
        }),
        expect.objectContaining({
          code: 'SICK_LEAVE',
          amount: expectedSickLeave,
        }),
        expect.objectContaining({
          code: 'TRANSPORT_ALLOWANCE',
          amount: expectedTransportAllowance,
        }),
      ]),
    );
  });
});
