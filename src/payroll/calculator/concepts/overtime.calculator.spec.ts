import { ConceptType, PayrollNovelty, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { OvertimeCalculator } from './overtime.calculator';

describe('OvertimeCalculator', () => {
  let calculator: OvertimeCalculator;

  beforeEach(() => {
    calculator = new OvertimeCalculator();
  });

  const createOvertime = (
    type: 'OVERTIME' | 'OVERTIME_NIGHT',
    dayType: 'REGULAR' | 'SUNDAY' | 'HOLIDAY',
    hours: string,
    description: string,
  ): PayrollNovelty =>
    ({
      type,
      dayType,
      quantity: new Prisma.Decimal(hours),
      amount: null,
      description,
    }) as unknown as PayrollNovelty;

  it('should calculate daytime overtime using the configured multiplier', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createOvertime(
        'OVERTIME',
        'REGULAR',
        '2',
        '2 horas extra diurnas',
      ),
    ]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('25000');

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]).toEqual({
      code: 'OVERTIME',
      name: '2 horas extra diurnas',
      type: ConceptType.EARNING,
      amount: new Decimal('25000'),
    });
  });

  it('should calculate nighttime overtime using the configured multiplier', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createOvertime(
        'OVERTIME_NIGHT',
        'REGULAR',
        '2',
        '2 horas extra nocturnas',
      ),
    ]);

    expect(result.earned.toString()).toBe('35000');
  });

  it('should calculate daytime overtime on sunday using combined surcharges', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createOvertime(
        'OVERTIME',
        'SUNDAY',
        '2',
        '2 horas extra diurnas dominicales',
      ),
    ]);

    expect(result.earned.toString()).toBe('43000');
  });

  it('should calculate nighttime overtime on holiday using combined surcharges', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createOvertime(
        'OVERTIME_NIGHT',
        'HOLIDAY',
        '2',
        '2 horas extra nocturnas festivas',
      ),
    ]);

    expect(result.earned.toString()).toBe('53000');
  });

  it('should preserve fractional overtime hours exactly', () => {
    const result = calculator.calculate(new Decimal('2100000'), [
      createOvertime(
        'OVERTIME',
        'REGULAR',
        '1.5',
        'Hora extra fraccionaria',
      ),
    ]);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.toString()).toBe('18750');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });
});