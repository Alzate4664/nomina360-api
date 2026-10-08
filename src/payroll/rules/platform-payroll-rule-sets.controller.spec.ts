import { RequestMethod, ValidationPipe } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PayrollRuleSetStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformScopeGuard } from '../../common/guards/platform-scope.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantScopeGuard } from '../../common/guards/tenant-scope.guard';
import { ListPayrollRuleSetsQueryDto } from './dto/list-payroll-rule-sets-query.dto';
import {
  PayrollRuleSetQueryInput,
  PayrollRuleSetQueryResult,
  PayrollRuleSetQueryService,
} from './payroll-rule-set-query.service';
import { PlatformPayrollRuleSetsController } from './platform-payroll-rule-sets.controller';

describe('PlatformPayrollRuleSetsController', () => {
  let controller: PlatformPayrollRuleSetsController;
  const handler = Object.getOwnPropertyDescriptor(
    PlatformPayrollRuleSetsController.prototype,
    'findAll',
  )?.value as object;
  const service = {
    findAll: jest.fn<
      Promise<PayrollRuleSetQueryResult>,
      [PayrollRuleSetQueryInput]
    >(),
  };
  const result: PayrollRuleSetQueryResult = {
    data: [
      {
        id: 'rule-set-1',
        jurisdictionCode: 'CO',
        version: 1,
        schemaVersion: 999,
        status: PayrollRuleSetStatus.PUBLISHED,
        effectiveFrom: '2000-01-01',
        effectiveTo: '2000-12-31',
        publishedAt: null,
        createdAt: new Date('2000-01-01'),
        updatedAt: new Date('2000-01-01'),
      },
    ],
    page: 2,
    limit: 10,
    total: 1,
    totalPages: 1,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    service.findAll.mockResolvedValue(result);
    const module = await Test.createTestingModule({
      controllers: [PlatformPayrollRuleSetsController],
      providers: [{ provide: PayrollRuleSetQueryService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PlatformScopeGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PlatformPayrollRuleSetsController);
  });

  it('declares the exact controller path and GET root route', () => {
    expect(
      Reflect.getMetadata(PATH_METADATA, PlatformPayrollRuleSetsController),
    ).toBe('platform/payroll-rule-sets');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('uses exactly JwtAuthGuard then PlatformScopeGuard without tenant or role guards', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      PlatformPayrollRuleSetsController,
    );
    expect(guards).toEqual([JwtAuthGuard, PlatformScopeGuard]);
    expect(guards).not.toContain(TenantScopeGuard);
    expect(guards).not.toContain(RolesGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });

  it('delegates validated values once and returns metadata unchanged without derived active state', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const query = (await pipe.transform(
      { jurisdictionCode: 'CO', status: 'PUBLISHED', page: '2', limit: '10' },
      { type: 'query', metatype: ListPayrollRuleSetsQueryDto },
    )) as ListPayrollRuleSetsQueryDto;
    expect(await controller.findAll(query)).toBe(result);
    expect(service.findAll).toHaveBeenCalledTimes(1);
    expect(service.findAll.mock.calls[0]).toEqual([
      {
        jurisdictionCode: 'CO',
        status: PayrollRuleSetStatus.PUBLISHED,
        page: 2,
        limit: 10,
      },
    ]);
    expect(result.data[0]).not.toHaveProperty('active');
    expect(result.data[0]).not.toHaveProperty('isActive');
  });

  it('applies defaults 1/20 without adding companyId or tenant scope', async () => {
    expect(await controller.findAll(new ListPayrollRuleSetsQueryDto())).toBe(
      result,
    );
    expect(service.findAll).toHaveBeenCalledTimes(1);
    expect(service.findAll.mock.calls[0]).toEqual([
      { jurisdictionCode: undefined, status: undefined, page: 1, limit: 20 },
    ]);
  });

  it.each([
    { page: 3, limit: undefined, expectedPage: 3, expectedLimit: 20 },
    { page: undefined, limit: 5, expectedPage: 1, expectedLimit: 5 },
  ])(
    'defaults only omitted pagination fields: %j',
    async ({ page, limit, expectedPage, expectedLimit }) => {
      await controller.findAll({ page, limit });
      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(service.findAll).toHaveBeenCalledWith({
        jurisdictionCode: undefined,
        status: undefined,
        page: expectedPage,
        limit: expectedLimit,
      });
    },
  );
});
