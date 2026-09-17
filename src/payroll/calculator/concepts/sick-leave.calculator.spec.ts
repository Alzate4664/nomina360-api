import {
  ConceptType,
  PayrollNovelty,
  Prisma,
  SickLeaveOrigin,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { SickLeaveCalculator } from './sick-leave.calculator';

describe('SickLeaveCalculator', () => {
  let calculator: SickLeaveCalculator;

  beforeEach(() => {
    calculator = new SickLeaveCalculator();
  });

  const createSickLeave = (
    origin: SickLeaveOrigin,
    startDay: number,
    days: string,
    sickLeaveIbc = '3000000',
    description = 'Incapacidad',
  ): PayrollNovelty =>
    ({
      type: 'SICK_LEAVE',
      sickLeaveOrigin: origin,
      sickLeaveStartDay: startDay,
      sickLeaveIbc: new Prisma.Decimal(sickLeaveIbc),
      quantity: new Prisma.Decimal(days),
      amount: null,
      description,
    }) as unknown as PayrollNovelty;

  const commonDiseaseDailyAmount = () =>
    new Decimal('100000').times(2).dividedBy(3);

  it('should calculate common disease starting on day 1', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, '2'),
    ]);

    const expectedDaily = commonDiseaseDailyAmount();
    const expected = expectedDaily.plus(expectedDaily);

    expect(Decimal.isDecimal(result.earned)).toBe(true);
    expect(result.earned.eq(expected)).toBe(true);

    expect(result.concepts).toHaveLength(1);
    expect(result.concepts[0]).toMatchObject({
      code: 'SICK_LEAVE',
      name: 'Incapacidad',
      type: ConceptType.EARNING,
    });

    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
    expect(result.concepts[0].amount.eq(expected)).toBe(true);
  });

  it('should calculate common disease between days 3 and 90', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 3, '3'),
    ]);

    const expectedDaily = commonDiseaseDailyAmount();
    const expected = expectedDaily.plus(expectedDaily).plus(expectedDaily);

    expect(result.earned.eq(expected)).toBe(true);
  });

  it('should calculate common disease starting from day 91', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 91, '3'),
    ]);

    expect(result.earned.toString()).toBe('150000');

    expect(result.concepts).toEqual([
      {
        code: 'SICK_LEAVE',
        name: 'Incapacidad',
        type: ConceptType.EARNING,
        amount: new Decimal('150000'),
      },
    ]);
  });

  it('should calculate common disease crossing payment ranges', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 89, '4'),
    ]);

    const twoThirdsDay = commonDiseaseDailyAmount();

    const expected = twoThirdsDay
      .plus(twoThirdsDay)
      .plus('50000')
      .plus('50000');

    expect(result.earned.eq(expected)).toBe(true);
    expect(result.concepts[0].amount.eq(expected)).toBe(true);
  });

  it('should calculate work accident sick leave', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.WORK_ACCIDENT, 1, '3'),
    ]);

    expect(result.earned.toString()).toBe('300000');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });

  it('should calculate occupational disease sick leave', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.OCCUPATIONAL_DISEASE, 1, '3'),
    ]);

    expect(result.earned.toString()).toBe('300000');
  });

  it('should use sick leave IBC instead of employee base salary', () => {
    const result = calculator.calculate([
      createSickLeave(
        SickLeaveOrigin.WORK_ACCIDENT,
        1,
        '3',
        '4500000',
      ),
    ]);

    expect(result.earned.toString()).toBe('450000');
  });

  it('should preserve exact decimal IBC arithmetic', () => {
    const result = calculator.calculate([
      createSickLeave(
        SickLeaveOrigin.WORK_ACCIDENT,
        1,
        '3',
        '23345.4',
      ),
    ]);

    expect(result.earned.toString()).toBe('2334.54');
    expect(Decimal.isDecimal(result.concepts[0].amount)).toBe(true);
  });

  it('should ignore sick leave with zero days', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, '0'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should ignore sick leave with negative days', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, '-2'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should ignore sick leave with invalid IBC', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, '2', '0'),
    ]);

    expect(result.earned.toString()).toBe('0');
    expect(result.concepts).toEqual([]);
  });

  it('should return the total number of valid sick leave days as Decimal', () => {
    const result = calculator.calculate([
      createSickLeave(SickLeaveOrigin.COMMON_DISEASE, 1, '2'),
      createSickLeave(SickLeaveOrigin.WORK_ACCIDENT, 1, '3'),
    ]);

    expect(Decimal.isDecimal(result.days)).toBe(true);
    expect(result.days.toString()).toBe('5');
  });
});
