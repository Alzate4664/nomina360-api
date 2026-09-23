import { ConceptType, PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BonusCalculator } from './bonus.calculator';

describe('BonusCalculator', () => {
  let calculator: BonusCalculator;

  beforeEach(() => {
    calculator = new BonusCalculator();
  });

  it('should preserve an exact bonus amount as Decimal', () => {
    const novelty = {
      type: 'BONUS',
      amount: new Prisma.Decimal('150000.25'),
      description: 'Bono especial',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate([novelty]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('150000.25');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0].code).toBe('BONUS');
    expect(result.concepts[0].name).toBe('Bono especial');
    expect(result.concepts[0].type).toBe(ConceptType.EARNING);

    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
    expect(result.concepts[0].amount.toString()).toBe('150000.25');
  });

  it('should sum bonus amounts without IEEE-754 noise', () => {
    const first = {
      type: 'BONUS',
      amount: new Prisma.Decimal('0.1'),
      description: 'Bono 1',
    } as unknown as PayrollNovelty;

    const second = {
      type: 'BONUS',
      amount: new Prisma.Decimal('0.2'),
      description: 'Bono 2',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate([first, second]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0.3');
  });

  it('should ignore novelties that are not bonuses', () => {
    const novelty = {
      type: 'DEDUCTION',
      amount: new Prisma.Decimal('50000'),
      description: 'Descuento',
    } as unknown as PayrollNovelty;

    const result = calculator.calculate([novelty]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });
});
