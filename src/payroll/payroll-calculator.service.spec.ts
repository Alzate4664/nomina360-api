import { PAYROLL_RATES } from './calculator/config/payroll-rates.config';
import { AbsenceCalculator } from './calculator/concepts/absence.calculator';
import { BaseSalaryCalculator } from './calculator/concepts/base-salary.calculator';
import { BonusCalculator } from './calculator/concepts/bonus.calculator';
import { DeductionCalculator } from './calculator/concepts/deduction.calculator';
import { HealthCalculator } from './calculator/concepts/health.calculator';
import { NightSurchargeCalculator } from './calculator/concepts/night-surcharge.calculator';
import { OvertimeCalculator } from './calculator/concepts/overtime.calculator';
import { PensionCalculator } from './calculator/concepts/pension.calculator';
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

    expect(result.earnedTotal).toBe(
      baseSalary + expectedTransportAllowance,
    );

    expect(result.deductionsTotal).toBe(
      expectedHealth + expectedPension,
    );

    expect(result.netPay).toBe(
      baseSalary +
        expectedTransportAllowance -
        expectedHealth -
        expectedPension,
    );
  });
});