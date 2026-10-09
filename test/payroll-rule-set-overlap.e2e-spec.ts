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

function draftData(
  id: string,
  jurisdictionCode: string,
  version: number,
  effectiveFrom: string,
  effectiveTo: string | null,
): Prisma.PayrollRuleSetCreateInput {
  return {
    id,
    jurisdictionCode,
    version,
    schemaVersion: snapshot.schemaVersion,
    status: PayrollRuleSetStatus.DRAFT,
    effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
    effectiveTo: effectiveTo ? new Date(`${effectiveTo}T00:00:00.000Z`) : null,
    rulesPayload: snapshot.rulesPayload as unknown as Prisma.InputJsonValue,
  };
}

async function publish(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  await tx.payrollRuleSet.update({
    where: {
      id,
    },
    data: {
      status: PayrollRuleSetStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
}

describe('PayrollRuleSet published overlap database invariant (e2e)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows overlapping drafts in the same jurisdiction', async () => {
    await runAndRollback(prisma, async (tx) => {
      await tx.payrollRuleSet.create({
        data: draftData(
          'overlap-draft-a',
          'ZX',
          992001,
          '2095-01-01',
          '2096-01-01',
        ),
      });

      await tx.payrollRuleSet.create({
        data: draftData(
          'overlap-draft-b',
          'ZX',
          992002,
          '2095-06-01',
          '2096-06-01',
        ),
      });
    });
  });

  it('allows adjacent published ranges in the same jurisdiction', async () => {
    await runAndRollback(prisma, async (tx) => {
      await tx.payrollRuleSet.create({
        data: draftData(
          'overlap-adjacent-a',
          'ZY',
          992003,
          '2095-01-01',
          '2096-01-01',
        ),
      });

      await tx.payrollRuleSet.create({
        data: draftData(
          'overlap-adjacent-b',
          'ZY',
          992004,
          '2096-01-01',
          '2097-01-01',
        ),
      });

      await publish(tx, 'overlap-adjacent-a');
      await publish(tx, 'overlap-adjacent-b');
    });
  });

  it('rejects overlapping published ranges in the same jurisdiction', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.payrollRuleSet.create({
          data: draftData(
            'overlap-published-a',
            'ZW',
            992005,
            '2095-01-01',
            '2096-01-01',
          ),
        });

        await tx.payrollRuleSet.create({
          data: draftData(
            'overlap-published-b',
            'ZW',
            992006,
            '2095-06-01',
            '2096-06-01',
          ),
        });

        await publish(tx, 'overlap-published-a');
        await publish(tx, 'overlap-published-b');
      }),
    ).rejects.toThrow();
  });

  it('allows equal published ranges in different jurisdictions', async () => {
    await runAndRollback(prisma, async (tx) => {
      await tx.payrollRuleSet.create({
        data: draftData(
          'overlap-jurisdiction-a',
          'ZU',
          992007,
          '2095-01-01',
          '2096-01-01',
        ),
      });

      await tx.payrollRuleSet.create({
        data: draftData(
          'overlap-jurisdiction-b',
          'ZV',
          992007,
          '2095-01-01',
          '2096-01-01',
        ),
      });

      await publish(tx, 'overlap-jurisdiction-a');
      await publish(tx, 'overlap-jurisdiction-b');
    });
  });

  it('rejects publication after an open-ended published range', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.payrollRuleSet.create({
          data: draftData(
            'overlap-open-ended-a',
            'ZT',
            992008,
            '2095-01-01',
            null,
          ),
        });

        await tx.payrollRuleSet.create({
          data: draftData(
            'overlap-open-ended-b',
            'ZT',
            992009,
            '2096-01-01',
            '2097-01-01',
          ),
        });

        await publish(tx, 'overlap-open-ended-a');
        await publish(tx, 'overlap-open-ended-b');
      }),
    ).rejects.toThrow();
  });
});
