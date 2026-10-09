import { HttpException, RequestMethod, ValidationPipe } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedPlatformUser } from '../../common/types/authenticated-user.type';
import { CreatePayrollRuleSetDraftDto } from './dto/create-payroll-rule-set-draft.dto';
import { EditPayrollRuleSetDraftDto } from './dto/edit-payroll-rule-set-draft.dto';
import { PayrollRuleSetDomainError } from './domain/payroll-rule-set.errors';
import { PayrollRulesPayloadValidationError } from './payroll-rules-codec';
import { PayrollRuleSetDraftQueryError } from './payroll-rule-set-query.service';
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
import {
  PayrollRuleSetDraftCreationError,
  PayrollRuleSetDraftCreationService,
} from './payroll-rule-set-draft-creation.service';
import {
  PayrollRuleSetDraftEditingError,
  PayrollRuleSetDraftEditingService,
} from './payroll-rule-set-draft-editing.service';

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
      providers: [
        { provide: PayrollRuleSetQueryService, useValue: service },
        { provide: PayrollRuleSetDraftCreationService, useValue: {} },
        { provide: PayrollRuleSetDraftEditingService, useValue: {} },
      ],
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

describe('Platform draft HTTP foundation', () => {
  const query = { findAll: jest.fn(), findDraftDetail: jest.fn() };
  const creation = {
    createDraft: jest.fn<Promise<unknown>, [unknown, string]>(),
  };
  const editing = { editDraft: jest.fn<Promise<unknown>, [unknown, string]>() };
  const controller = new PlatformPayrollRuleSetsController(
    query as unknown as PayrollRuleSetQueryService,
    creation as unknown as PayrollRuleSetDraftCreationService,
    editing as unknown as PayrollRuleSetDraftEditingService,
  );
  const user: AuthenticatedPlatformUser = {
    sub: ' actor ',
    email: 'platform@example.test',
    role: 'SUPER_ADMIN',
    companyId: null,
  };
  const createBody = Object.assign(new CreatePayrollRuleSetDraftDto(), {
    jurisdictionCode: 'CO',
    schemaVersion: 1,
    rulesPayload: { amount: '001.00' },
    approvedEffectiveFrom: '2026-01-01',
    approvedEffectiveTo: null,
  });
  const editBody = Object.assign(new EditPayrollRuleSetDraftDto(), {
    expectedDraftRevision: 4,
    schemaVersion: 1,
    rulesPayload: createBody.rulesPayload,
    approvedEffectiveFrom: '2026-01-01',
    approvedEffectiveTo: null,
  });
  const metadata = { id: 'draft-id', draftRevision: 4, status: 'DRAFT' };
  const response = { setHeader: jest.fn() };
  beforeEach(() => {
    jest.resetAllMocks();
    creation.createDraft.mockResolvedValue(metadata);
    editing.editDraft.mockResolvedValue(metadata);
    query.findDraftDetail.mockResolvedValue({
      ...metadata,
      rulesPayload: createBody.rulesPayload,
    });
  });
  it.each([
    ['createDraft', 'drafts', RequestMethod.POST],
    ['findDraftDetail', 'drafts/:id', RequestMethod.GET],
    ['editDraft', 'drafts/:id', RequestMethod.PUT],
  ])('declares %s static draft route', (name, path, method) => {
    const handler = Object.getOwnPropertyDescriptor(
      PlatformPayrollRuleSetsController.prototype,
      name,
    )?.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });
  it('creates once with exactly plain data keys and untouched authenticated sub, sets Location and returns metadata', async () => {
    const result = await controller.createDraft(
      createBody,
      user,
      response as unknown as Response,
    );
    expect(result).toBe(metadata);
    expect(result).not.toHaveProperty('rulesPayload');
    expect(creation.createDraft).toHaveBeenCalledTimes(1);
    expect(creation.createDraft).toHaveBeenCalledWith(
      { ...createBody },
      ' actor ',
    );
    const input: unknown = creation.createDraft.mock.calls[0][0];
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
    expect(input).not.toBe(createBody);
    expect(Object.keys(input as object).sort()).toEqual(
      [
        'jurisdictionCode',
        'schemaVersion',
        'rulesPayload',
        'approvedEffectiveFrom',
        'approvedEffectiveTo',
      ].sort(),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Location',
      '/platform/payroll-rule-sets/drafts/draft-id',
    );
    expect(query.findDraftDetail).not.toHaveBeenCalled();
    expect(query.findAll).not.toHaveBeenCalled();
  });
  it('edits once using route id and a new plain object, without reread or retry', async () => {
    const body = Object.assign(new EditPayrollRuleSetDraftDto(), editBody, {
      ruleSetId: 'body-id',
      actorUserId: 'body-actor',
      jurisdictionCode: 'US',
    });
    expect(await controller.editDraft({ id: ' route-id ' }, body, user)).toBe(
      metadata,
    );
    expect(editing.editDraft).toHaveBeenCalledTimes(1);
    expect(editing.editDraft).toHaveBeenCalledWith(
      { ...editBody, ruleSetId: ' route-id ' },
      ' actor ',
    );
    const input: unknown = editing.editDraft.mock.calls[0][0];
    expect(Object.getPrototypeOf(input)).toBe(Object.prototype);
    expect(Object.keys(input as object).sort()).toEqual(
      [
        'ruleSetId',
        'expectedDraftRevision',
        'schemaVersion',
        'rulesPayload',
        'approvedEffectiveFrom',
        'approvedEffectiveTo',
      ].sort(),
    );
    expect(query.findDraftDetail).not.toHaveBeenCalled();
    expect(query.findAll).not.toHaveBeenCalled();
    expect(metadata).not.toHaveProperty('rulesPayload');
  });
  it('delegates detail once without mutation', async () => {
    const result = await controller.findDraftDetail({ id: 'id' });
    expect(result).toBe(
      query.findDraftDetail.mock.results[0].value
        ? await query.findDraftDetail.mock.results[0].value
        : undefined,
    );
    expect(query.findDraftDetail).toHaveBeenCalledTimes(1);
    expect(query.findDraftDetail).toHaveBeenCalledWith('id');
    expect(creation.createDraft).not.toHaveBeenCalled();
    expect(editing.editDraft).not.toHaveBeenCalled();
  });
  it.each([undefined, null, '', '  ', 12])(
    'rejects invalid authenticated sub %j before delegation',
    async (sub) => {
      const actor = { ...user, sub } as AuthenticatedPlatformUser;
      await expect(
        controller.createDraft(
          createBody,
          actor,
          response as unknown as Response,
        ),
      ).rejects.toMatchObject({ status: 401 });
      await expect(
        controller.editDraft({ id: 'id' }, editBody, actor),
      ).rejects.toMatchObject({ status: 401 });
      expect(creation.createDraft).not.toHaveBeenCalled();
      expect(editing.editDraft).not.toHaveBeenCalled();
    },
  );
  const errorCases: [Error, number, string][] = [
    ...(
      [
        'INVALID_CREATE_INPUT',
        'INVALID_JURISDICTION',
        'INVALID_ACTOR_USER_ID',
        'PLATFORM_ACTOR_UNAUTHORIZED',
        'VERSION_EXHAUSTED',
        'VERSION_ALLOCATION_CONFLICT',
      ] as const
    ).map((code): [Error, number, string] => [
      new PayrollRuleSetDraftCreationError(code, 'sensitive'),
      code === 'INVALID_ACTOR_USER_ID'
        ? 401
        : code === 'PLATFORM_ACTOR_UNAUTHORIZED'
          ? 403
          : code.startsWith('VERSION')
            ? 409
            : 400,
      code,
    ]),
    ...(
      [
        'INVALID_EDIT_INPUT',
        'INVALID_RULE_SET_ID',
        'INVALID_EXPECTED_DRAFT_REVISION',
        'INVALID_ACTOR_USER_ID',
        'PLATFORM_ACTOR_UNAUTHORIZED',
        'RULE_SET_NOT_FOUND',
        'RULE_SET_NOT_DRAFT',
        'STALE_DRAFT_REVISION',
        'DRAFT_REVISION_EXHAUSTED',
        'DRAFT_EDIT_INVARIANT_VIOLATION',
      ] as const
    ).map((code): [Error, number, string] => [
      new PayrollRuleSetDraftEditingError(code),
      code === 'DRAFT_EDIT_INVARIANT_VIOLATION'
        ? 500
        : code === 'INVALID_ACTOR_USER_ID'
          ? 401
          : code === 'PLATFORM_ACTOR_UNAUTHORIZED'
            ? 403
            : code === 'RULE_SET_NOT_FOUND'
              ? 404
              : code.startsWith('INVALID')
                ? 400
                : 409,
      code,
    ]),
    ...(
      [
        'INVALID_BUSINESS_DATE',
        'INVALID_APPROVED_TEMPORAL_ENVELOPE',
        'INVALID_CANONICAL_CONTENT',
      ] as const
    ).map((code): [Error, number, string] => [
      new PayrollRuleSetDomainError(code, 'sensitive'),
      422,
      code,
    ]),
    [
      new PayrollRuleSetDraftQueryError('RULE_SET_NOT_FOUND'),
      404,
      'RULE_SET_NOT_FOUND',
    ],
    [
      new PayrollRuleSetDraftQueryError('RULE_SET_NOT_DRAFT'),
      409,
      'RULE_SET_NOT_DRAFT',
    ],
    [
      new PayrollRulesPayloadValidationError('sensitive'),
      422,
      'INVALID_RULES_PAYLOAD',
    ],
    [
      new PayrollRuleSetDomainError('INVALID_REVISION', 'sensitive'),
      500,
      'INTERNAL_SERVER_ERROR',
    ],
    [new Error('sensitive SQL audit failure'), 500, 'INTERNAL_SERVER_ERROR'],
    [
      Object.assign(new Error('sensitive Prisma'), { code: 'P2002' }),
      500,
      'INTERNAL_SERVER_ERROR',
    ],
    [
      Object.assign(new Error('spoofed'), { code: 'RULE_SET_NOT_FOUND' }),
      500,
      'INTERNAL_SERVER_ERROR',
    ],
  ];
  it.each(errorCases)(
    'sanitizes %s to %s %s across handlers',
    async (error, status, code) => {
      creation.createDraft.mockRejectedValue(error);
      editing.editDraft.mockRejectedValue(error);
      query.findDraftDetail.mockRejectedValue(error);
      for (const invoke of [
        () =>
          controller.createDraft(
            createBody,
            user,
            response as unknown as Response,
          ),
        () => controller.editDraft({ id: 'id' }, editBody, user),
        () => controller.findDraftDetail({ id: 'id' }),
      ]) {
        try {
          await invoke();
          throw new Error('Expected HTTP failure');
        } catch (caught) {
          expect(caught).toBeInstanceOf(HttpException);
          const http = caught as HttpException;
          expect(http.getStatus()).toBe(status);
          expect(http.getResponse()).toEqual({
            statusCode: status,
            code,
            message: expect.any(String) as unknown,
          });
          expect(JSON.stringify(http.getResponse())).not.toContain('sensitive');
        }
      }
      expect(response.setHeader).not.toHaveBeenCalled();
    },
  );
});
