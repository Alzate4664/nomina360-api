import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { DEFAULT_PAYROLL_RULES } from '../../rules/default-payroll-rules';
import { TransportAllowanceCalculator } from './transport-allowance.calculator';

describe('TransportAllowanceCalculator', () => {
  let calculator: TransportAllowanceCalculator;

  const defaultRules = {
    minimumWage: DEFAULT_PAYROLL_RULES.minimumWage,
    transportAllowance: DEFAULT_PAYROLL_RULES.transportAllowance,
  };

  beforeEach(() => {
    calculator = new TransportAllowanceCalculator();
  });

  it('should calculate the full monthly transport allowance for an eligible employee', () => {
    const result = calculator.calculate(
      DEFAULT_PAYROLL_RULES.minimumWage,
      new Decimal(30),
      defaultRules,
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe(
      DEFAULT_PAYROLL_RULES.transportAllowance.monthlyAmount.toString(),
    );

    expect(result.concepts).toHaveLength(1);

    expect(result.concepts[0]).toEqual({
      code: 'TRANSPORT_ALLOWANCE',
      name: 'Auxilio de transporte',
      type: ConceptType.EARNING,
      amount: new Decimal(
        DEFAULT_PAYROLL_RULES.transportAllowance.monthlyAmount,
      ),
    });
  });

  it('should prorate and preserve the existing integer rounding behavior', () => {
    const result = calculator.calculate(
      DEFAULT_PAYROLL_RULES.minimumWage,
      new Decimal(15),
      defaultRules,
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('124548');
  });

  it('should not pay transport allowance above the salary limit', () => {
    const salaryLimit = DEFAULT_PAYROLL_RULES.minimumWage.times(
      DEFAULT_PAYROLL_RULES.transportAllowance.salaryLimitInMinimumWages,
    );

    const result = calculator.calculate(
      salaryLimit.plus(1),
      new Decimal(30),
      defaultRules,
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should allow transport allowance exactly at the salary limit', () => {
    const salaryLimit = DEFAULT_PAYROLL_RULES.minimumWage.times(
      DEFAULT_PAYROLL_RULES.transportAllowance.salaryLimitInMinimumWages,
    );

    const result = calculator.calculate(
      salaryLimit,
      new Decimal(30),
      defaultRules,
    );

    expect(result.earned.toString()).toBe(
      DEFAULT_PAYROLL_RULES.transportAllowance.monthlyAmount.toString(),
    );
  });

  it('should not pay transport allowance when worked days are zero', () => {
    const result = calculator.calculate(
      DEFAULT_PAYROLL_RULES.minimumWage,
      new Decimal(0),
      defaultRules,
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should cap worked days at 30', () => {
    const result = calculator.calculate(
      DEFAULT_PAYROLL_RULES.minimumWage,
      new Decimal(31),
      defaultRules,
    );

    expect(result.earned.toString()).toBe(
      DEFAULT_PAYROLL_RULES.transportAllowance.monthlyAmount.toString(),
    );
  });

  it('should round an exact half peso consistently using Decimal arithmetic', () => {
    const result = calculator.calculate(
      DEFAULT_PAYROLL_RULES.minimumWage,
      new Decimal(27),
      defaultRules,
    );

    expect(result.earned.toString()).toBe('224186');
  });

  it('should use the supplied salary eligibility rules', () => {
    const rules = {
      minimumWage: new Decimal('1000'),
      transportAllowance: {
        ...defaultRules.transportAllowance,
        salaryLimitInMinimumWages: new Decimal('3'),
      },
    };

    const eligible = calculator.calculate(
      new Decimal('3000'),
      new Decimal(30),
      rules,
    );

    const ineligible = calculator.calculate(
      new Decimal('3001'),
      new Decimal(30),
      rules,
    );

    expect(eligible.earned.gt(0)).toBe(true);
    expect(ineligible.earned.toString()).toBe('0');
  });

  it('should use the supplied monthly amount and proration day basis', () => {
    const rules = {
      minimumWage: new Decimal('1000'),
      transportAllowance: {
        monthlyAmount: new Decimal('1200'),
        salaryLimitInMinimumWages: new Decimal('10'),
        monthlyProrationDayBasis: 20,
      },
    };

    const prorated = calculator.calculate(
      new Decimal('1000'),
      new Decimal(10),
      rules,
    );

    const capped = calculator.calculate(
      new Decimal('1000'),
      new Decimal(25),
      rules,
    );

    expect(prorated.earned.toString()).toBe('600');
    expect(capped.earned.toString()).toBe('1200');
  });
});
