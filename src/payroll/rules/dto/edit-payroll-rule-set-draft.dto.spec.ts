import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EditPayrollRuleSetDraftDto } from './edit-payroll-rule-set-draft.dto';
describe('EditPayrollRuleSetDraftDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const valid = {
    expectedDraftRevision: 1,
    schemaVersion: 1,
    rulesPayload: { amount: '001.2300', nested: { rate: '0.0400' } },
    approvedEffectiveFrom: '2026-02-31',
    approvedEffectiveTo: null,
  };
  const parse = (value: unknown) =>
    pipe.transform(value, {
      type: 'body',
      metatype: EditPayrollRuleSetDraftDto,
    });
  it('preserves decimal spelling and validates only date shape', async () => {
    const result = (await parse(valid)) as EditPayrollRuleSetDraftDto;
    expect(result).toBeInstanceOf(EditPayrollRuleSetDraftDto);
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
    'jurisdictionCode',
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
    ['expectedDraftRevision', '1'],
    ['expectedDraftRevision', 0],
    ['expectedDraftRevision', -1],
    ['expectedDraftRevision', 1.5],
    ['expectedDraftRevision', 2147483648],
    ['expectedDraftRevision', null],
    ['expectedDraftRevision', true],
  ])('rejects %s=%j', async (key, value) => {
    await expect(parse({ ...valid, [key]: value })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it.each([1, 2147483647])('accepts revision boundary %s', async (revision) => {
    await expect(
      parse({ ...valid, expectedDraftRevision: revision }),
    ).resolves.toBeDefined();
  });
});
