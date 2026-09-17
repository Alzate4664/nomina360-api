import { ConceptType, PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { AbsenceCalculator } from './absence.calculator';

describe('AbsenceCalculator', () => {
  let calculator: AbsenceCalculator;

  beforeEach(() => {
    calculator = new AbsenceCalculator();
  });

  const createAbsence = (
    days: string,
    description = 'Ausencia',
  ): PayrollNovelty =>
    ({
      type: 'ABSENCE',
      quantity: new Prisma.Decimal(days),
      description,
    }) as unknown as PayrollNovelty;

  it('should calculate absence deduction as Decimal', () => {
    const result = calculator.calculate(
      new Decimal('100000'),
      [createAbsence('3')],
    );

    expect(Decimal.isDecimal(result.deductions)).toBe(true);
    expect(result.deductions.toString()).toBe('300000');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]).toEqual({
      code: 'ABSENCE',
      name: 'Ausencia',
      type: ConceptType.DEDUCTION,
      amount: new Decimal('300000'),
    });
  });

  it('should preserve fractional absence quantities exactly', () => {
    const result = calculator.calculate(
      new Decimal('23345.4'),
      [createAbsence('1.5')],
    );

    expect(result.deductions.toString()).toBe('35018.1');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });

  it('should sum deductions without IEEE-754 noise', () => {
    const result = calculator.calculate(new Decimal('1'), [
      createAbsence('0.1', 'Ausencia 1'),
      createAbsence('0.2', 'Ausencia 2'),
    ]);

    expect(result.deductions.toString()).toBe('0.3');
  });

  it('should ignore non absence novelties', () => {
    const novelty = {
      type: 'BONUS',
      quantity: new Prisma.Decimal('2'),
    } as unknown as PayrollNovelty;

    const result = calculator.calculate(new Decimal('100000'), [novelty]);

    expect(result.deductions.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});