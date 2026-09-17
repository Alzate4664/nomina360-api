import { ConceptType, PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { DeductionCalculator } from './deduction.calculator';

describe('DeductionCalculator', () => {
  let calculator: DeductionCalculator;

  beforeEach(() => {
    calculator = new DeductionCalculator();
  });

  it('should preserve an exact deduction amount as Decimal', () => {
    const novelty = {
      type: 'DEDUCTION',
      amount: new Prisma.Decimal('85000.75'),
      description: 'Descuento autorizado',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate([novelty]);

    expect(Decimal.isDecimal(result.deductions)).toBe(true);
    expect(result.deductions.toString()).toBe('85000.75');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].code).toBe('DEDUCTION');
    expect(result.concepts[0].name).toBe('Descuento autorizado');
    expect(result.concepts[0].type).toBe(ConceptType.DEDUCTION);

    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
    expect(result.concepts[0].amount.toString()).toBe('85000.75');
  });

  it('should sum deductions without IEEE-754 noise', () => {
    const first = {
      type: 'DEDUCTION',
      amount: new Prisma.Decimal('0.1'),
    } as unknown as PayrollNovelty;

    const second = {
      type: 'DEDUCTION',
      amount: new Prisma.Decimal('0.2'),
    } as unknown as PayrollNovelty;

    const result = calculator.calculate([first, second]);

    expect(Decimal.isDecimal(result.deductions)).toBe(true);
    expect(result.deductions.toString()).toBe('0.3');
  });

  it('should ignore novelties that are not deductions', () => {
    const novelty = {
      type: 'BONUS',
      amount: new Prisma.Decimal('50000'),
    } as unknown as PayrollNovelty;

    const result = calculator.calculate([novelty]);

    expect(Decimal.isDecimal(result.deductions)).toBe(true);
    expect(result.deductions.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});