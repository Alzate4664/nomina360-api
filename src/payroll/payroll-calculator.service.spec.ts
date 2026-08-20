import { LeaveType, PayrollDayType, SickLeaveOrigin } from '@prisma/client';
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
import { VacationCalculator } from './calculator/concepts/vacation.calculator';
import { LeaveCalculator } from './calculator/concepts/leave.calculator';

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
      new VacationCalculator(),
      new LeaveCalculator(),
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

  it('should exclude vacation days from ordinary salary and transport allowance', () => {
    const baseSalary = PAYROLL_RATES.minimumWage;

    const vacationNovelty = {
      id: 'vacation-1',
      companyId: 'company-1',
      employeeId: 'employee-1',
      payrollPeriodId: 'period-1',
      type: 'VACATION' as const,
      dayType: null,
      sickLeaveOrigin: null,
      sickLeaveStartDay: null,
      sickLeaveIbc: null,
      quantity: 5,
      amount: null,
      description: 'Vacaciones',
      createdAt: new Date(),
    };

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [vacationNovelty],
    });

    const dailySalary = baseSalary / 30;

    const expectedOrdinarySalary = dailySalary * 25;
    const expectedVacationPay = dailySalary * 5;

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const vacationConcept = result.concepts.find(
      (concept) => concept.code === 'VACATION',
    );

    const transportConcept = result.concepts.find(
      (concept) => concept.code === 'TRANSPORT_ALLOWANCE',
    );

    expect(baseSalaryConcept?.amount).toBeCloseTo(expectedOrdinarySalary);
    expect(vacationConcept?.amount).toBeCloseTo(expectedVacationPay);

    expect(
      (baseSalaryConcept?.amount ?? 0) + (vacationConcept?.amount ?? 0),
    ).toBeCloseTo(baseSalary);

    expect(transportConcept?.amount).toBe(
      Math.round((PAYROLL_RATES.transportAllowance.monthlyAmount / 30) * 25),
    );
  });

  it('should exclude paid leave days from ordinary salary and pay them as leave', () => {
    const baseSalary = 3000000;

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [
        {
          id: 'leave-paid-1',
          companyId: 'company-1',
          employeeId: 'employee-1',
          payrollPeriodId: 'period-1',
          type: 'LEAVE',
          dayType: PayrollDayType.REGULAR,
          sickLeaveOrigin: null,
          sickLeaveStartDay: null,
          sickLeaveIbc: null,
          leaveType: LeaveType.PAID,
          quantity: 3,
          amount: null,
          description: 'Licencia remunerada',
          createdAt: new Date(),
        },
      ],
    });

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const leaveConcept = result.concepts.find(
      (concept) => concept.code === 'LEAVE',
    );

    expect(baseSalaryConcept?.amount).toBe(2700000);
    expect(leaveConcept?.amount).toBe(300000);

    expect((baseSalaryConcept?.amount ?? 0) + (leaveConcept?.amount ?? 0)).toBe(
      3000000,
    );
  });

  it('should exclude unpaid leave days from ordinary salary without generating leave earnings', () => {
    const baseSalary = 3000000;

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [
        {
          id: 'leave-unpaid-1',
          companyId: 'company-1',
          employeeId: 'employee-1',
          payrollPeriodId: 'period-1',
          type: 'LEAVE',
          dayType: PayrollDayType.REGULAR,
          sickLeaveOrigin: null,
          sickLeaveStartDay: null,
          sickLeaveIbc: null,
          leaveType: LeaveType.UNPAID,
          quantity: 3,
          amount: null,
          description: 'Licencia no remunerada',
          createdAt: new Date(),
        },
      ],
    });

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const leaveConcept = result.concepts.find(
      (concept) => concept.code === 'LEAVE',
    );

    expect(baseSalaryConcept?.amount).toBe(2700000);
    expect(leaveConcept).toBeUndefined();

    const transportConcept = result.concepts.find(
      (concept) => concept.code === 'TRANSPORT_ALLOWANCE',
    );

    const expectedTransportAllowance = Math.round(
      (PAYROLL_RATES.transportAllowance.monthlyAmount / 30) * 27,
    );

    expect(transportConcept?.amount).toBe(expectedTransportAllowance);

    expect(result.earnedTotal).toBe(2700000 + expectedTransportAllowance);
  });
});
