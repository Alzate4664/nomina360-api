import { PayrollRuleSetStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';

class RollbackTestTransaction extends Error {}

function requireTestDatabase(): void {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(
      new URL(process.env.DATABASE_URL ?? '').pathname.slice(1),
    );
  } catch {
    throw new Error(
      'Draft revision invariants require a valid test DATABASE_URL.',
    );
  }
  if (!/(?:^|[_-])(?:test|e2e)(?:[_-]|$)/i.test(databaseName)) {
    throw new Error(
      'Draft revision invariants refuse mutations outside a test database.',
    );
  }
}

interface RevisionRow {
  id: string;
  draftRevision: number;
  status: PayrollRuleSetStatus;
}

describe('PayrollRuleSet draft revision database invariants (e2e)', () => {
  let prisma: PrismaService | undefined;

  beforeAll(async () => {
    requireTestDatabase();
    prisma = new PrismaService();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function runAndRollback(
    callback: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    requireTestDatabase();
    if (!prisma) throw new Error('Test Prisma client is not initialized.');
    try {
      await prisma.$transaction(async (tx) => {
        const collision = await tx.payrollRuleSet.count({
          where: { jurisdictionCode: 'QV' },
        });
        if (collision) {
          throw new Error(
            'Reserved synthetic QV jurisdiction already exists; nothing replaced.',
          );
        }
        await callback(tx);
        throw new RollbackTestTransaction();
      });
    } catch (error) {
      if (error instanceof RollbackTestTransaction) return;
      throw error;
    }
  }

  async function insert(
    tx: Prisma.TransactionClient,
    status = PayrollRuleSetStatus.DRAFT,
    revision?: number | null,
  ): Promise<RevisionRow> {
    const id = `e2e-prs-draft-revision-${randomUUID()}`;
    const revisionColumn =
      revision === undefined ? Prisma.empty : Prisma.sql`, "draftRevision"`;
    const revisionValue =
      revision === undefined
        ? Prisma.empty
        : Prisma.sql`, CAST(${revision} AS INTEGER)`;
    const publishedAt =
      status === PayrollRuleSetStatus.PUBLISHED
        ? new Date('2096-01-01T00:00:00.000Z')
        : null;
    requireTestDatabase();
    const rows = await tx.$queryRaw<RevisionRow[]>(Prisma.sql`
      INSERT INTO "PayrollRuleSet" (
        "id", "jurisdictionCode", "version", "schemaVersion", "status",
        "effectiveFrom", "effectiveTo", "rulesPayload", "publishedAt", "updatedAt"${revisionColumn}
      ) VALUES (
        ${id}, 'QV', 1, 1, CAST(${status} AS "PayrollRuleSetStatus"),
        DATE '2096-01-01', DATE '2097-01-01',
        '{"synthetic":true,"purpose":"draft-revision-storage-only"}'::jsonb,
        ${publishedAt}, CURRENT_TIMESTAMP${revisionValue}
      )
      RETURNING "id", "draftRevision", "status"
    `);
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it.each([PayrollRuleSetStatus.DRAFT, PayrollRuleSetStatus.PUBLISHED])(
    'defaults an omitted draftRevision to 1 on a consistent %s insert',
    async (status) => {
      await runAndRollback(async (tx) => {
        expect(await insert(tx, status)).toMatchObject({
          status,
          draftRevision: 1,
        });
      });
    },
  );

  it.each([
    { revision: null, code: '23502', message: 'draftRevision' },
    {
      revision: 0,
      code: '23514',
      message: 'PayrollRuleSet_draft_revision_check',
    },
    {
      revision: -1,
      code: '23514',
      message: 'PayrollRuleSet_draft_revision_check',
    },
    { revision: 2147483648, code: '22003', message: 'out of range' },
  ])(
    'rejects explicit draftRevision $revision in PostgreSQL',
    async ({ revision, code, message }) => {
      await runAndRollback(async (tx) => {
        await expect(
          insert(tx, PayrollRuleSetStatus.DRAFT, revision),
        ).rejects.toMatchObject({
          code: 'P2010',
          meta: {
            driverAdapterError: {
              cause: {
                originalCode: code,
                originalMessage: expect.stringContaining(message) as unknown,
              },
            },
          },
        });
      });
    },
  );

  it.each([7, 2147483647])(
    'accepts positive DRAFT revision %s',
    async (revision) => {
      await runAndRollback(async (tx) => {
        expect(
          await insert(tx, PayrollRuleSetStatus.DRAFT, revision),
        ).toMatchObject({
          status: PayrollRuleSetStatus.DRAFT,
          draftRevision: revision,
        });
      });
    },
  );

  it('preserves the existing positive revision on publication', async () => {
    await runAndRollback(async (tx) => {
      const draft = await insert(tx, PayrollRuleSetStatus.DRAFT, 7);
      requireTestDatabase();
      const published = await tx.payrollRuleSet.update({
        where: { id: draft.id },
        data: {
          status: PayrollRuleSetStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
      expect(published.status).toBe(PayrollRuleSetStatus.PUBLISHED);
      expect(published.draftRevision).toBe(7);
    });
  });

  it.each([8, 7])(
    'rejects assigning revision %s to an already PUBLISHED revision 7',
    async (revision) => {
      await runAndRollback(async (tx) => {
        const published = await insert(tx, PayrollRuleSetStatus.PUBLISHED, 7);
        requireTestDatabase();
        await expect(tx.$executeRaw`
        UPDATE "PayrollRuleSet" SET "draftRevision" = ${revision}
        WHERE "id" = ${published.id}
      `).rejects.toThrow(/Published PayrollRuleSet rows are immutable/i);
      });
    },
  );
});
