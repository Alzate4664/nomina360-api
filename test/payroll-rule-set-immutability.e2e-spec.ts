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

function createDraftData(
  id: string,
  version: number,
): Prisma.PayrollRuleSetCreateInput {
  return {
    id,
    jurisdictionCode: 'ZZ',
    version,
    schemaVersion: snapshot.schemaVersion,
    status: PayrollRuleSetStatus.DRAFT,
    effectiveFrom: new Date('2098-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2099-01-01T00:00:00.000Z'),
    rulesPayload: snapshot.rulesPayload as unknown as Prisma.InputJsonValue,
  };
}

describe('PayrollRuleSet database immutability (e2e)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows a draft to be updated and deleted', async () => {
    await runAndRollback(prisma, async (tx) => {
      const id = 'immutability-draft';

      await tx.payrollRuleSet.create({
        data: createDraftData(id, 990001),
      });

      const updated = await tx.payrollRuleSet.update({
        where: {
          id,
        },
        data: {
          effectiveTo: new Date('2099-06-01T00:00:00.000Z'),
        },
      });

      expect(updated.status).toBe(PayrollRuleSetStatus.DRAFT);

      const deleted = await tx.payrollRuleSet.delete({
        where: {
          id,
        },
      });

      expect(deleted.id).toBe(id);
    });
  });

  it('allows the initial DRAFT to PUBLISHED transition', async () => {
    await runAndRollback(prisma, async (tx) => {
      const id = 'immutability-publish';

      await tx.payrollRuleSet.create({
        data: createDraftData(id, 990002),
      });

      const published = await tx.payrollRuleSet.update({
        where: {
          id,
        },
        data: {
          status: PayrollRuleSetStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });

      expect(published.status).toBe(PayrollRuleSetStatus.PUBLISHED);
      expect(published.publishedAt).toBeInstanceOf(Date);
    });
  });

  it('rejects updates after a rule set has been published', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const id = 'immutability-update';

        await tx.payrollRuleSet.create({
          data: createDraftData(id, 990003),
        });

        await tx.payrollRuleSet.update({
          where: {
            id,
          },
          data: {
            status: PayrollRuleSetStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });

        await tx.payrollRuleSet.update({
          where: {
            id,
          },
          data: {
            effectiveTo: new Date('2100-01-01T00:00:00.000Z'),
          },
        });
      }),
    ).rejects.toThrow(/Published PayrollRuleSet rows are immutable/i);
  });

  it('rejects deletion after a rule set has been published', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const id = 'immutability-delete';

        await tx.payrollRuleSet.create({
          data: createDraftData(id, 990004),
        });

        await tx.payrollRuleSet.update({
          where: {
            id,
          },
          data: {
            status: PayrollRuleSetStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });

        await tx.payrollRuleSet.delete({
          where: {
            id,
          },
        });
      }),
    ).rejects.toThrow(/Published PayrollRuleSet rows are immutable/i);
  });
});
