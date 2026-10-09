import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreatePayrollRuleSetDraftDto } from './create-payroll-rule-set-draft.dto';
describe('CreatePayrollRuleSetDraftDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const valid = {
    jurisdictionCode: 'CO',
    schemaVersion: 1,
    rulesPayload: { amount: '001.2300', nested: { rate: '0.0400' } },
    approvedEffectiveFrom: '2026-02-31',
    approvedEffectiveTo: null,
  };
  const parse = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: CreatePayrollRuleSetDraftDto,
    });
  it('preserves decimal spelling and validates only date shape', async () => {
    const result = (await parse(valid)) as CreatePayrollRuleSetDraftDto;
    expect(result).toBeInstanceOf(CreatePayrollRuleSetDraftDto);
    expect(result.rulesPayload).toEqual(valid.rulesPayload);
    expect(result.approvedEffectiveTo).toBeNull();
  });
  it('accepts shaped end dates', async () => {
    await expect(
      parse({ ...valid, approvedEffectiveTo: '2027-12-31' }),
    ).resolves.toBeDefined();
  });
  it.each(Object.keys(valid))('requires %s', async (key) => {
    const input: Record<string, unknown> = { ...valid };
    delete input[key];
    await expect(parse(input)).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    'actorUserId',
    'sub',
    'companyId',
    'id',
    'ruleSetId',
    'status',
    'draftRevision',
    'version',
    'publishedAt',
    'extra',
  ])('forbids %s', async (key) => {
    await expect(parse({ ...valid, [key]: 'injected' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it.each([
    ['schemaVersion', '1'],
    ['schemaVersion', null],
    ['schemaVersion', 0],
    ['schemaVersion', 1.1],
    ['schemaVersion', true],
    ['rulesPayload', null],
    ['rulesPayload', []],
    ['rulesPayload', 'object'],
    ['rulesPayload', 3],
    ['approvedEffectiveFrom', null],
    ['approvedEffectiveFrom', 20260101],
    ['approvedEffectiveFrom', '2026-1-01'],
    ['approvedEffectiveFrom', ' 2026-01-01'],
    ['approvedEffectiveTo', 3],
    ['approvedEffectiveTo', ''],
    ['approvedEffectiveTo', '2026-01-01T00:00:00Z'],
    ['jurisdictionCode', 'co'],
    ['jurisdictionCode', ' CO'],
    ['jurisdictionCode', 'COL'],
    ['jurisdictionCode', 3],
    ['jurisdictionCode', null],
  ])('rejects %s=%j', async (key, value) => {
    await expect(parse({ ...valid, [key]: value })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
