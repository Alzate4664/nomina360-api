import { PayrollRuleSetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_PAYROLL_RULES } from '../src/payroll/rules/default-payroll-rules';
import { serializePayrollRulesSnapshot } from '../src/payroll/rules/payroll-rules-codec';

class RollbackTestTransaction extends Error {}

const snapshot = serializePayrollRulesSnapshot(DEFAULT_PAYROLL_RULES);

async function runAndRollback(
  prisma: PrismaService,
  callback: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      await callback(tx);
      throw new RollbackTestTransaction();
    });
  } catch (error) {
    if (error instanceof RollbackTestTransaction) {
      return;
    }

    throw error;
  }
}

function validDraftData(
  id: string,
  version: number,
): Prisma.PayrollRuleSetCreateInput {
  return {
    id,
    jurisdictionCode: 'ZZ',
    version,
    schemaVersion: snapshot.schemaVersion,
    status: PayrollRuleSetStatus.DRAFT,
    effectiveFrom: new Date('2097-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2098-01-01T00:00:00.000Z'),
    rulesPayload: snapshot.rulesPayload as unknown as Prisma.InputJsonValue,
  };
}

describe('PayrollRuleSet publication metadata database invariants (e2e)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects DRAFT rows that already have publishedAt', async () => {
    await expect(
      prisma.payrollRuleSet.create({
        data: {
          ...validDraftData('metadata-draft-published-at', 991001),
          publishedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects PUBLISHED rows without publishedAt', async () => {
    await expect(
      prisma.payrollRuleSet.create({
        data: {
          ...validDraftData('metadata-published-without-date', 991002),
          status: PayrollRuleSetStatus.PUBLISHED,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects lowercase jurisdiction codes', async () => {
    await expect(
      prisma.payrollRuleSet.create({
        data: {
          ...validDraftData('metadata-invalid-jurisdiction', 991003),
          jurisdictionCode: 'zz',
        },
      }),
    ).rejects.toThrow();
  });

  it('allows a consistent DRAFT row', async () => {
    await runAndRollback(prisma, async (tx) => {
      const created = await tx.payrollRuleSet.create({
        data: validDraftData('metadata-valid-draft', 991004),
      });

      expect(created.status).toBe(PayrollRuleSetStatus.DRAFT);
      expect(created.publishedAt).toBeNull();
      expect(created.jurisdictionCode).toBe('ZZ');
    });
  });

  it('allows a consistent DRAFT to PUBLISHED transition', async () => {
    await runAndRollback(prisma, async (tx) => {
      const id = 'metadata-valid-publication';

      await tx.payrollRuleSet.create({
        data: validDraftData(id, 991005),
      });

      const publishedAt = new Date();

      const published = await tx.payrollRuleSet.update({
        where: {
          id,
        },
        data: {
          status: PayrollRuleSetStatus.PUBLISHED,
          publishedAt,
        },
      });

      expect(published.status).toBe(PayrollRuleSetStatus.PUBLISHED);
      expect(published.publishedAt).toEqual(publishedAt);
    });
  });
});
