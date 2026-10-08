import { PayrollRuleSetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

class RollbackTestTransaction extends Error {}

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
    schemaVersion: 1,
    status: PayrollRuleSetStatus.DRAFT,
    effectiveFrom: new Date('2098-01-01T00:00:00.000Z'),
    effectiveTo: new Date('2099-01-01T00:00:00.000Z'),
    rulesPayload: { synthetic: true, purpose: 'database-immutability' },
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

  it.each([
    { field: 'schemaVersion', data: { schemaVersion: 999 } },
    {
      field: 'rulesPayload',
      data: { rulesPayload: { synthetic: true, revised: true } },
    },
    {
      field: 'effective dates',
      data: {
        effectiveFrom: new Date('2098-06-01T00:00:00.000Z'),
        effectiveTo: new Date('2099-06-01T00:00:00.000Z'),
      },
    },
    { field: 'draftRevision', data: { draftRevision: 2 } },
  ])('allows DRAFT $field changes', async ({ data }) => {
    await runAndRollback(prisma, async (tx) => {
      const id = 'immutability-draft';

      await tx.payrollRuleSet.create({
        data: createDraftData(id, 990001),
      });

      const updated = await tx.payrollRuleSet.update({
        where: {
          id,
        },
        data,
      });

      expect(updated.status).toBe(PayrollRuleSetStatus.DRAFT);
      expect(updated).toMatchObject(data);
      expect(updated).toMatchObject({
        id,
        jurisdictionCode: 'ZZ',
        version: 990001,
      });
    });
  });

  it('rejects direct DRAFT deletion', async () => {
    await expect(
      runAndRollback(prisma, async (tx) => {
        const id = 'immutability-draft-delete';
        await tx.payrollRuleSet.create({ data: createDraftData(id, 990005) });
        await tx.payrollRuleSet.delete({ where: { id } });
      }),
    ).rejects.toThrow(/Draft PayrollRuleSet rows cannot be deleted/i);
  });

  describe.each([false, true])(
    'DRAFT identity changes with publication=%s',
    (publish) => {
      it.each([
        { field: 'id', data: { id: 'immutability-renamed' } },
        { field: 'jurisdictionCode', data: { jurisdictionCode: 'ZY' } },
        { field: 'version', data: { version: 990007 } },
      ])('rejects a direct $field update', async ({ data }) => {
        await expect(
          runAndRollback(prisma, async (tx) => {
            const id = 'immutability-draft-identity';
            await tx.payrollRuleSet.create({
              data: createDraftData(id, 990006),
            });
            await tx.payrollRuleSet.update({
              where: { id },
              data: {
                ...data,
                ...(publish
                  ? {
                      status: PayrollRuleSetStatus.PUBLISHED,
                      publishedAt: new Date(),
                    }
                  : {}),
              },
            });
          }),
        ).rejects.toThrow(/Draft PayrollRuleSet identity is immutable/i);
      });
    },
  );

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
      expect(published).toMatchObject({
        id,
        jurisdictionCode: 'ZZ',
        version: 990002,
      });
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
