import { PayrollRuleSetStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_PAYROLL_RULES } from './default-payroll-rules';
import { serializePayrollRulesSnapshot } from './payroll-rules-codec';
import {
  PayrollRuleSetPublicationError,
  PayrollRuleSetPublicationService,
} from './payroll-rule-set-publication.service';

function transactionWith<TClient>(client: TClient) {
  return <TResult>(
    callback: (transaction: TClient) => Promise<TResult>,
  ): Promise<TResult> => callback(client);
}

function dateMatcher(): unknown {
  return expect.any(Date);
}

describe('PayrollRuleSetPublicationService', () => {
  let service: PayrollRuleSetPublicationService;

  const snapshot = serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES);

  const draftRuleSet = {
    id: 'rules-co-1',
    jurisdictionCode: 'CO',
    version: 1,
    schemaVersion: snapshot.schemaVersion,
    status: PayrollRuleSetStatus.DRAFT,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2027-01-01T00:00:00.000Z'),
    rulesPayload: snapshot.rulesPayload,
    publishedAt: null,
  };

  const tx = {
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
    payrollRuleSet: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(),
  };

  const auditService = {
    log: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.$transaction.mockImplementation(transactionWith(tx));

    tx.$executeRaw.mockResolvedValue(1);
    tx.$queryRaw.mockResolvedValue([{ id: draftRuleSet.id }]);

    tx.payrollRuleSet.findUnique
      .mockResolvedValueOnce({
        id: draftRuleSet.id,
        jurisdictionCode: draftRuleSet.jurisdictionCode,
        status: PayrollRuleSetStatus.DRAFT,
      })
      .mockResolvedValueOnce(draftRuleSet);

    tx.payrollRuleSet.findFirst.mockResolvedValue(null);
    tx.payrollRuleSet.updateMany.mockResolvedValue({ count: 1 });

    auditService.log.mockResolvedValue({
      id: 'audit-1',
    });

    service = new PayrollRuleSetPublicationService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  it('publishes a valid draft and audits the transition in the same transaction', async () => {
    const result = await service.publish(draftRuleSet.id, 'admin-user-1');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);

    expect(tx.payrollRuleSet.findFirst).toHaveBeenCalledWith({
      where: {
        jurisdictionCode: 'CO',
        status: PayrollRuleSetStatus.PUBLISHED,
        effectiveFrom: {
          lt: draftRuleSet.effectiveTo,
        },
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gt: draftRuleSet.effectiveFrom,
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    expect(tx.payrollRuleSet.updateMany).toHaveBeenCalledWith({
      where: {
        id: draftRuleSet.id,
        jurisdictionCode: 'CO',
        status: PayrollRuleSetStatus.DRAFT,
      },
      data: {
        status: PayrollRuleSetStatus.PUBLISHED,
        publishedAt: dateMatcher(),
      },
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-user-1',
        action: 'PUBLISH_PAYROLL_RULE_SET',
        entity: 'PayrollRuleSet',
        entityId: draftRuleSet.id,
      }),
      tx,
    );

    expect(result.ruleSetId).toBe(draftRuleSet.id);
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it('rejects a missing rule set before acquiring locks', async () => {
    tx.payrollRuleSet.findUnique.mockReset();
    tx.payrollRuleSet.findUnique.mockResolvedValue(null);

    await expect(
      service.publish('missing-rule-set', 'admin-user-1'),
    ).rejects.toMatchObject<Partial<PayrollRuleSetPublicationError>>({
      code: 'RULE_SET_NOT_FOUND',
    });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects a rule set that is already published', async () => {
    tx.payrollRuleSet.findUnique.mockReset();
    tx.payrollRuleSet.findUnique.mockResolvedValue({
      id: draftRuleSet.id,
      jurisdictionCode: 'CO',
      status: PayrollRuleSetStatus.PUBLISHED,
    });

    await expect(
      service.publish(draftRuleSet.id, 'admin-user-1'),
    ).rejects.toMatchObject<Partial<PayrollRuleSetPublicationError>>({
      code: 'RULE_SET_NOT_DRAFT',
    });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects an invalid jurisdiction before acquiring the advisory lock', async () => {
    tx.payrollRuleSet.findUnique.mockReset();
    tx.payrollRuleSet.findUnique.mockResolvedValue({
      id: draftRuleSet.id,
      jurisdictionCode: 'co',
      status: PayrollRuleSetStatus.DRAFT,
    });

    await expect(
      service.publish(draftRuleSet.id, 'admin-user-1'),
    ).rejects.toMatchObject<Partial<PayrollRuleSetPublicationError>>({
      code: 'RULE_SET_JURISDICTION_INVALID',
    });

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a draft with invalid publication metadata', async () => {
    tx.payrollRuleSet.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        id: draftRuleSet.id,
        jurisdictionCode: 'CO',
        status: PayrollRuleSetStatus.DRAFT,
      })
      .mockResolvedValueOnce({
        ...draftRuleSet,
        publishedAt: new Date(),
      });

    await expect(
      service.publish(draftRuleSet.id, 'admin-user-1'),
    ).rejects.toMatchObject<Partial<PayrollRuleSetPublicationError>>({
      code: 'RULE_SET_PUBLICATION_METADATA_INVALID',
    });
  });

  it('rejects an invalid persisted payload', async () => {
    tx.payrollRuleSet.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        id: draftRuleSet.id,
        jurisdictionCode: 'CO',
        status: PayrollRuleSetStatus.DRAFT,
      })
      .mockResolvedValueOnce({
        ...draftRuleSet,
        rulesPayload: {
          ...snapshot.rulesPayload,
          minimumWage: 1750905,
        },
      });

    await expect(
      service.publish(draftRuleSet.id, 'admin-user-1'),
    ).rejects.toMatchObject<Partial<PayrollRuleSetPublicationError>>({
      code: 'RULE_SET_PAYLOAD_INVALID',
    });

    expect(tx.payrollRuleSet.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an overlapping published rule set', async () => {
    tx.payrollRuleSet.findFirst.mockResolvedValue({
      id: 'existing-published-rules',
    });

    await expect(
      service.publish(draftRuleSet.id, 'admin-user-1'),
    ).rejects.toMatchObject<Partial<PayrollRuleSetPublicationError>>({
      code: 'RULE_SET_OVERLAP',
    });

    expect(tx.payrollRuleSet.updateMany).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('uses the correct overlap query for an open-ended candidate', async () => {
    tx.payrollRuleSet.findUnique
      .mockReset()
      .mockResolvedValueOnce({
        id: draftRuleSet.id,
        jurisdictionCode: 'CO',
        status: PayrollRuleSetStatus.DRAFT,
      })
      .mockResolvedValueOnce({
        ...draftRuleSet,
        effectiveTo: null,
      });

    await service.publish(draftRuleSet.id, 'admin-user-1');

    expect(tx.payrollRuleSet.findFirst).toHaveBeenCalledWith({
      where: {
        jurisdictionCode: 'CO',
        status: PayrollRuleSetStatus.PUBLISHED,
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gt: draftRuleSet.effectiveFrom,
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });
  });

  it('rejects when the draft changes before the publication transition', async () => {
    tx.payrollRuleSet.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.publish(draftRuleSet.id, 'admin-user-1'),
    ).rejects.toMatchObject<Partial<PayrollRuleSetPublicationError>>({
      code: 'RULE_SET_CHANGED_CONCURRENTLY',
    });

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rejects an empty actor user id before opening a transaction', async () => {
    await expect(service.publish(draftRuleSet.id, '   ')).rejects.toMatchObject<
      Partial<PayrollRuleSetPublicationError>
    >({
      code: 'INVALID_ACTOR_USER_ID',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('propagates audit failures so publication cannot commit without its audit record', async () => {
    auditService.log.mockRejectedValue(new Error('forced audit failure'));

    await expect(
      service.publish(draftRuleSet.id, 'admin-user-1'),
    ).rejects.toThrow('forced audit failure');

    expect(tx.payrollRuleSet.updateMany).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalled();
  });
});
