import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PayrollRuleSetIdParamDto } from './payroll-rule-set-id-param.dto';
describe('PayrollRuleSetIdParamDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const parse = (value: unknown) =>
    pipe.transform(value, {
      type: 'param',
      metatype: PayrollRuleSetIdParamDto,
    });
  it.each(['arbitrary-id', ' id with spaces '])('preserves %s', async (id) => {
    expect(await parse({ id })).toEqual({ id });
  });
  it.each([
    {},
    { id: '' },
    { id: '  ' },
    { id: null },
    { id: 3 },
    { id: [] },
    { id: 'ok', actorUserId: 'bad' },
  ])('rejects %j', async (value) => {
    await expect(parse(value)).rejects.toBeInstanceOf(BadRequestException);
  });
});
