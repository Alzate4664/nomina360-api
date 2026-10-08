import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PayrollRuleSetStatus } from '@prisma/client';
import { ListPayrollRuleSetsQueryDto } from './list-payroll-rule-sets-query.dto';

describe('ListPayrollRuleSetsQueryDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const validate = (
    query: Record<string, unknown>,
  ): Promise<ListPayrollRuleSetsQueryDto> =>
    pipe.transform(query, {
      type: 'query',
      metatype: ListPayrollRuleSetsQueryDto,
    });

  it('accepts an empty query without DTO pagination defaults', async () => {
    const query = await validate({});
    expect(query).toBeInstanceOf(ListPayrollRuleSetsQueryDto);
    expect(query.jurisdictionCode).toBeUndefined();
    expect(query.status).toBeUndefined();
    expect(query.page).toBeUndefined();
    expect(query.limit).toBeUndefined();
  });

  it.each([PayrollRuleSetStatus.DRAFT, PayrollRuleSetStatus.PUBLISHED])(
    'accepts all fields with status %s and transforms pagination to numbers',
    async (status) => {
      expect(
        await validate({
          jurisdictionCode: 'CO',
          status,
          page: '2',
          limit: '30',
        }),
      ).toEqual({
        jurisdictionCode: 'CO',
        status,
        page: 2,
        limit: 30,
      });
    },
  );

  it.each(['unknown', 'companyId', 'active', 'isActive'])(
    'rejects unknown property %s',
    async (key) => {
      await expect(validate({ [key]: 'value' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  const repeatedValues = [
    { field: 'jurisdictionCode', value: 'CO' },
    { field: 'status', value: 'DRAFT' },
    { field: 'page', value: '1' },
    { field: 'limit', value: '20' },
  ];
  it.each(repeatedValues)(
    'rejects identical repeated $field values',
    async ({ field, value }) => {
      await expect(
        validate({ [field]: [value, value] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each([
    'co',
    'Co',
    'cO',
    ' CO',
    'CO ',
    'C O',
    'CÓ',
    'ＣＯ',
    'C',
    'COL',
    '',
    'CO\n',
  ])('rejects jurisdiction %j', async (jurisdictionCode) => {
    await expect(validate({ jurisdictionCode })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it.each(['draft', 'published', 'ACTIVE', '', ' DRAFT', 'DRAFT '])(
    'rejects status %j',
    async (status) => {
      await expect(validate({ status })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  describe.each(['jurisdictionCode', 'status', 'page', 'limit'])(
    '%s scalar validation',
    (field) => {
      it.each([null, [], ['1'], {}, { value: '1' }, 1, true])(
        'rejects non-string input %j',
        async (value) => {
          await expect(validate({ [field]: value })).rejects.toBeInstanceOf(
            BadRequestException,
          );
        },
      );
    },
  );

  describe.each(['page', 'limit'])('%s pagination', (field) => {
    it.each([
      '1.0',
      '1.5',
      '1e2',
      '0x10',
      '+1',
      ' ',
      ' 1',
      '1 ',
      '1\n',
      '1foo',
      '',
      '0',
      '000',
      '-1',
      'NaN',
      'Infinity',
      '-Infinity',
      '9007199254740992',
      '9999999999999999999999999999999999999999',
    ])('rejects invalid numeric text %j', async (value) => {
      await expect(validate({ [field]: value })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
    it('accepts leading zeros', async () => {
      expect(
        (await validate({ [field]: '00001' }))[field as 'page' | 'limit'],
      ).toBe(1);
    });
  });

  it.each([
    { field: 'page', value: '1', expected: 1 },
    { field: 'page', value: '1000', expected: 1000 },
    { field: 'limit', value: '1', expected: 1 },
    { field: 'limit', value: '100', expected: 100 },
  ])('accepts $field boundary $value', async ({ field, value, expected }) => {
    expect(
      (await validate({ [field]: value }))[field as 'page' | 'limit'],
    ).toBe(expected);
  });

  it.each([{ page: '1001' }, { limit: '101' }])(
    'rejects upper-bound overflow %j',
    async (query) => {
      await expect(validate(query)).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
