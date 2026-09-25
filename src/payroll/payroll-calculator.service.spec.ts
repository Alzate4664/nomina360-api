import {
  LeaveType,
  PayrollDayType,
  PayrollNovelty,
  Prisma,
  SickLeaveOrigin,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PAYROLL_RATES } from './calculator/config/payroll-rates.config';
import { AbsenceCalculator } from './calculator/concepts/absence.calculator';
import { BaseSalaryCalculator } from './calculator/concepts/base-salary.calculator';
import { BonusCalculator } from './calculator/concepts/bonus.calculator';
import { DeductionCalculator } from './calculator/concepts/deduction.calculator';
import { HealthCalculator } from './calculator/concepts/health.calculator';
import { LeaveCalculator } from './calculator/concepts/leave.calculator';
import { NightSurchargeCalculator } from './calculator/concepts/night-surcharge.calculator';
import { OvertimeCalculator } from './calculator/concepts/overtime.calculator';
import { PensionCalculator } from './calculator/concepts/pension.calculator';
import { SickLeaveCalculator } from './calculator/concepts/sick-leave.calculator';
import { SundayHolidayCalculator } from './calculator/concepts/sunday-holiday.calculator';
import { TransportAllowanceCalculator } from './calculator/concepts/transport-allowance.calculator';
import { VacationCalculator } from './calculator/concepts/vacation.calculator';
import { PayrollCalculatorService } from './payroll-calculator.service';
import { DEFAULT_PAYROLL_RULES } from './rules/default-payroll-rules';

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
    const baseSalary = new Decimal(PAYROLL_RATES.minimumWage);

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [],
      rules: DEFAULT_PAYROLL_RULES,
    });

    const expectedTransportAllowance = new Decimal(
      PAYROLL_RATES.transportAllowance.monthlyAmount,
    );

    const expectedHealth = baseSalary.times('0.04');
    const expectedPension = baseSalary.times('0.04');

    const expectedEarnedTotal = baseSalary.plus(expectedTransportAllowance);
    const expectedDeductions = expectedHealth.plus(expectedPension);
    const expectedNetPay = expectedEarnedTotal.minus(expectedDeductions);

    expect(Decimal.isDecimal(result.earnedTotal)).toBe(true);
    expect(Decimal.isDecimal(result.deductionsTotal)).toBe(true);
    expect(Decimal.isDecimal(result.netPay)).toBe(true);

    expect(result.earnedTotal.eq(expectedEarnedTotal)).toBe(true);
    expect(result.deductionsTotal.eq(expectedDeductions)).toBe(true);
    expect(result.netPay.eq(expectedNetPay)).toBe(true);
  });

  it('should exclude sick leave days from ordinary salary and transport allowance', () => {
    const baseSalary = new Decimal('3000000');

    const sickLeave = {
      type: 'SICK_LEAVE',
      dayType: PayrollDayType.REGULAR,
      sickLeaveOrigin: SickLeaveOrigin.WORK_ACCIDENT,
      sickLeaveStartDay: 1,
      sickLeaveIbc: new Prisma.Decimal('3000000'),
      quantity: new Prisma.Decimal('3'),
      amount: null,
      description: 'Incapacidad laboral de 3 días',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [sickLeave],
      rules: DEFAULT_PAYROLL_RULES,
    });

    const expectedOrdinarySalary = new Decimal('2700000');
    const expectedSickLeave = new Decimal('300000');

    const expectedTransportAllowance = new Decimal(
      PAYROLL_RATES.transportAllowance.monthlyAmount,
    )
      .dividedBy(30)
      .times(27)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    const expectedContributionBase =
      expectedOrdinarySalary.plus(expectedSickLeave);

    const expectedHealth = expectedContributionBase.times('0.04');
    const expectedPension = expectedContributionBase.times('0.04');

    const expectedEarnedTotal = expectedContributionBase.plus(
      expectedTransportAllowance,
    );

    const expectedDeductions = expectedHealth.plus(expectedPension);

    expect(result.earnedTotal.eq(expectedEarnedTotal)).toBe(true);
    expect(result.deductionsTotal.eq(expectedDeductions)).toBe(true);

    expect(
      result.netPay.eq(expectedEarnedTotal.minus(expectedDeductions)),
    ).toBe(true);

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const sickLeaveConcept = result.concepts.find(
      (concept) => concept.code === 'SICK_LEAVE',
    );

    const transportConcept = result.concepts.find(
      (concept) => concept.code === 'TRANSPORT_ALLOWANCE',
    );

    expect(baseSalaryConcept?.amount.toString()).toBe('2700000');
    expect(sickLeaveConcept?.amount.toString()).toBe('300000');

    expect(transportConcept?.amount.toString()).toBe(
      expectedTransportAllowance.toString(),
    );
  });

  it('should exclude vacation days from ordinary salary and transport allowance', () => {
    const baseSalary = new Decimal(PAYROLL_RATES.minimumWage);

    const vacationNovelty = {
      type: 'VACATION',
      quantity: new Prisma.Decimal('5'),
      amount: null,
      description: 'Vacaciones',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate({
      baseSalary,
      workedDays: 30,
      novelties: [vacationNovelty],
      rules: DEFAULT_PAYROLL_RULES,
    });

    const dailySalary = baseSalary.dividedBy(30);

    const expectedOrdinarySalary = dailySalary.times(25);
    const expectedVacationPay = dailySalary.times(5);

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const vacationConcept = result.concepts.find(
      (concept) => concept.code === 'VACATION',
    );

    const transportConcept = result.concepts.find(
      (concept) => concept.code === 'TRANSPORT_ALLOWANCE',
    );

    expect(baseSalaryConcept?.amount.eq(expectedOrdinarySalary)).toBe(true);
    expect(vacationConcept?.amount.eq(expectedVacationPay)).toBe(true);

    expect(
      baseSalaryConcept?.amount.plus(vacationConcept!.amount).eq(baseSalary),
    ).toBe(true);

    const expectedTransportAllowance = new Decimal(
      PAYROLL_RATES.transportAllowance.monthlyAmount,
    )
      .dividedBy(30)
      .times(25)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    expect(transportConcept?.amount.toString()).toBe(
      expectedTransportAllowance.toString(),
    );
  });

  it('should exclude paid leave days from ordinary salary and pay them as leave', () => {
    const paidLeave = {
      type: 'LEAVE',
      dayType: PayrollDayType.REGULAR,
      leaveType: LeaveType.PAID,
      quantity: new Prisma.Decimal('3'),
      amount: null,
      description: 'Licencia remunerada',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      workedDays: 30,
      novelties: [paidLeave],
      rules: DEFAULT_PAYROLL_RULES,
    });

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const leaveConcept = result.concepts.find(
      (concept) => concept.code === 'LEAVE',
    );

    expect(baseSalaryConcept?.amount.toString()).toBe('2700000');
    expect(leaveConcept?.amount.toString()).toBe('300000');

    expect(
      baseSalaryConcept?.amount.plus(leaveConcept!.amount).toString(),
    ).toBe('3000000');
  });

  it('should exclude unpaid leave days from ordinary salary without generating leave earnings', () => {
    const unpaidLeave = {
      type: 'LEAVE',
      dayType: PayrollDayType.REGULAR,
      leaveType: LeaveType.UNPAID,
      quantity: new Prisma.Decimal('3'),
      amount: null,
      description: 'Licencia no remunerada',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      workedDays: 30,
      novelties: [unpaidLeave],
      rules: DEFAULT_PAYROLL_RULES,
    });

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const leaveConcept = result.concepts.find(
      (concept) => concept.code === 'LEAVE',
    );

    expect(baseSalaryConcept?.amount.toString()).toBe('2700000');
    expect(leaveConcept).toBeUndefined();

    const transportConcept = result.concepts.find(
      (concept) => concept.code === 'TRANSPORT_ALLOWANCE',
    );

    const expectedTransportAllowance = new Decimal(
      PAYROLL_RATES.transportAllowance.monthlyAmount,
    )
      .dividedBy(30)
      .times(27)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    expect(transportConcept?.amount.toString()).toBe(
      expectedTransportAllowance.toString(),
    );

    expect(result.earnedTotal.toString()).toBe(
      new Decimal('2700000').plus(expectedTransportAllowance).toString(),
    );
  });

  it('should preserve fractional novelty quantities through orchestration', () => {
    const vacation = {
      type: 'VACATION',
      quantity: new Prisma.Decimal('1.5'),
      amount: null,
      description: 'Vacaciones parciales',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      workedDays: 30,
      novelties: [vacation],
      rules: DEFAULT_PAYROLL_RULES,
    });

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    const vacationConcept = result.concepts.find(
      (concept) => concept.code === 'VACATION',
    );

    expect(baseSalaryConcept?.amount.toString()).toBe('2850000');
    expect(vacationConcept?.amount.toString()).toBe('150000');
  });

  it('should propagate the supplied employee health rate to health calculation', () => {
    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      contributions: {
        ...DEFAULT_PAYROLL_RULES.contributions,
        employeeHealthRate: new Decimal('0.05'),
      },
    };

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      workedDays: 30,
      novelties: [],
      rules,
    });

    const healthConcept = result.concepts.find(
      (concept) => concept.code === 'HEALTH',
    );

    expect(healthConcept?.amount.toString()).toBe('150000');
  });

  it('should propagate the supplied employee pension rate to pension calculation', () => {
    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      contributions: {
        ...DEFAULT_PAYROLL_RULES.contributions,
        employeePensionRate: new Decimal('0.05'),
      },
    };

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      workedDays: 30,
      novelties: [],
      rules,
    });

    const pensionConcept = result.concepts.find(
      (concept) => concept.code === 'PENSION',
    );

    expect(pensionConcept?.amount.toString()).toBe('150000');
  });

  it('should propagate the supplied standard monthly hours to hourly calculations', () => {
    const overtime = {
      type: 'OVERTIME',
      dayType: PayrollDayType.REGULAR,
      quantity: new Prisma.Decimal('2'),
      amount: null,
      description: 'Horas extra',
    } as unknown as PayrollNovelty;

    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      standardMonthlyHours: new Decimal('200'),
    };

    const result = calculator.calculate({
      baseSalary: new Decimal('2000000'),
      workedDays: 30,
      novelties: [overtime],
      rules,
    });

    const overtimeConcept = result.concepts.find(
      (concept) => concept.code === 'OVERTIME',
    );

    expect(overtimeConcept?.amount.toString()).toBe('25000');
  });

  it('should propagate the supplied monthly salary day basis', () => {
    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      salary: {
        ...DEFAULT_PAYROLL_RULES.salary,
        monthlyDayBasis: 20,
      },
    };

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      workedDays: 10,
      novelties: [],
      rules,
    });

    const baseSalaryConcept = result.concepts.find(
      (concept) => concept.code === 'BASE_SALARY',
    );

    expect(baseSalaryConcept?.amount.toString()).toBe('1500000');
  });

  it('should use the supplied monthly salary day basis for absence deductions', () => {
    const absence = {
      type: 'ABSENCE',
      quantity: new Prisma.Decimal('2'),
      amount: null,
      description: 'Ausencia',
    } as unknown as PayrollNovelty;

    const rules = {
      ...DEFAULT_PAYROLL_RULES,
      salary: {
        ...DEFAULT_PAYROLL_RULES.salary,
        monthlyDayBasis: 20,
      },
    };

    const result = calculator.calculate({
      baseSalary: new Decimal('3000000'),
      workedDays: 30,
      novelties: [absence],
      rules,
    });

    const absenceConcept = result.concepts.find(
      (concept) => concept.code === 'ABSENCE',
    );

    expect(absenceConcept?.amount.toString()).toBe('300000');
  });
});
