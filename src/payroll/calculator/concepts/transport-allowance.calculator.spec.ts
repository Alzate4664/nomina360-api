import { ConceptType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PAYROLL_RATES } from '../config/payroll-rates.config';
import { TransportAllowanceCalculator } from './transport-allowance.calculator';

describe('TransportAllowanceCalculator', () => {
  let calculator: TransportAllowanceCalculator;

  beforeEach(() => {
    calculator = new TransportAllowanceCalculator();
  });

  it('should calculate the full monthly transport allowance for an eligible employee', () => {
    const result = calculator.calculate(
      new Decimal(PAYROLL_RATES.minimumWage),
      new Decimal(30),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe(
      PAYROLL_RATES.transportAllowance.monthlyAmount.toString(),
    );

    expect(result.concepts).toHaveLength(1);

    expect(result.concepts[0]).toEqual({
      code: 'TRANSPORT_ALLOWANCE',
      name: 'Auxilio de transporte',
      type: ConceptType.EARNING,
      amount: new Decimal(PAYROLL_RATES.transportAllowance.monthlyAmount),
    });
  });

  it('should prorate and preserve the existing integer rounding behavior', () => {
    const result = calculator.calculate(
      new Decimal(PAYROLL_RATES.minimumWage),
      new Decimal(15),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('124548');
  });

  it('should not pay transport allowance above the salary limit', () => {
    const salaryLimit = new Decimal(PAYROLL_RATES.minimumWage).times(
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages,
    );

    const result = calculator.calculate(salaryLimit.plus(1), new Decimal(30));

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should allow transport allowance exactly at the salary limit', () => {
    const salaryLimit = new Decimal(PAYROLL_RATES.minimumWage).times(
      PAYROLL_RATES.transportAllowance.salaryLimitInMinimumWages,
    );

    const result = calculator.calculate(salaryLimit, new Decimal(30));

    expect(result.earned.toString()).toBe(
      PAYROLL_RATES.transportAllowance.monthlyAmount.toString(),
    );
  });

  it('should not pay transport allowance when worked days are zero', () => {
    const result = calculator.calculate(
      new Decimal(PAYROLL_RATES.minimumWage),
      new Decimal(0),
    );

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should cap worked days at 30', () => {
    const result = calculator.calculate(
      new Decimal(PAYROLL_RATES.minimumWage),
      new Decimal(31),
    );

    expect(result.earned.toString()).toBe(
      PAYROLL_RATES.transportAllowance.monthlyAmount.toString(),
    );
  });

  it('should round an exact half peso consistently using Decimal arithmetic', () => {
    const result = calculator.calculate(
      new Decimal(PAYROLL_RATES.minimumWage),
      new Decimal(27),
    );

    expect(result.earned.toString()).toBe('224186');
  });
});
