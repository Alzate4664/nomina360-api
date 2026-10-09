import './setup-env';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';
import { isDeepStrictEqual } from 'node:util';
import { PayrollRuleSetStatus } from '@prisma/client';
import {
  E2E_CO_PAYROLL_RULE_SET_DATA,
  E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_FROM,
  E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_TO,
  E2E_CO_PAYROLL_RULE_SET_ID,
  E2E_CO_PAYROLL_RULE_SET_PAYLOAD,
  E2E_CO_PAYROLL_RULE_SET_PUBLISHED_AT,
  E2E_CO_PAYROLL_RULE_SET_SCHEMA_VERSION,
  E2E_CO_PAYROLL_RULE_SET_VERSION,
} from './fixtures/payroll-rule-set.fixture';

async function ensureE2ePayrollRuleSet(prisma: PrismaService): Promise<void> {
  const existing = await prisma.payrollRuleSet.findUnique({
    where: {
      id: E2E_CO_PAYROLL_RULE_SET_ID,
    },
  });

  if (!existing) {
    await prisma.payrollRuleSet.create({
      data: E2E_CO_PAYROLL_RULE_SET_DATA,
    });

    return;
  }

  const matchesFixture =
    existing.jurisdictionCode === 'CO' &&
    existing.version === E2E_CO_PAYROLL_RULE_SET_VERSION &&
    existing.schemaVersion === E2E_CO_PAYROLL_RULE_SET_SCHEMA_VERSION &&
    existing.status === PayrollRuleSetStatus.PUBLISHED &&
    existing.effectiveFrom.getTime() ===
      E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_FROM.getTime() &&
    existing.effectiveTo?.getTime() ===
      E2E_CO_PAYROLL_RULE_SET_EFFECTIVE_TO.getTime() &&
    existing.publishedAt?.getTime() ===
      E2E_CO_PAYROLL_RULE_SET_PUBLISHED_AT.getTime() &&
    isDeepStrictEqual(existing.rulesPayload, E2E_CO_PAYROLL_RULE_SET_PAYLOAD);

  if (!matchesFixture) {
    throw new Error(
      `El PayrollRuleSet E2E ${E2E_CO_PAYROLL_RULE_SET_ID} ya existe pero no coincide con el fixture esperado. No se modifica porque los RuleSets publicados son inmutables.`,
    );
  }
}

async function seedTestDatabase() {
  const prisma = new PrismaService();

  try {
    await prisma.$connect();

    await ensureE2ePayrollRuleSet(prisma);

    const passwordHash = await bcrypt.hash('12345678', 10);

    const company = await prisma.company.upsert({
      where: {
        nit: '900123456-1',
      },
      update: {
        name: 'Empresa Demo Test SAS',
        email: 'empresa-test@nomina360.com',
        phone: '3000000000',
        address: 'Medellín, Colombia',
        status: 'ACTIVE',
      },
      create: {
        name: 'Empresa Demo Test SAS',
        nit: '900123456-1',
        email: 'empresa-test@nomina360.com',
        phone: '3000000000',
        address: 'Medellín, Colombia',
        status: 'ACTIVE',
      },
    });

    const owner = await prisma.user.upsert({
      where: {
        email: 'admin@empresademo.com',
      },
      update: {
        companyId: company.id,
        name: 'Miguel Admin',
        passwordHash,
        role: 'OWNER',
        isActive: true,
      },
      create: {
        companyId: company.id,
        name: 'Miguel Admin',
        email: 'admin@empresademo.com',
        passwordHash,
        role: 'OWNER',
        isActive: true,
      },
    });

    console.log('Base de pruebas preparada correctamente.');
    console.log(`Empresa: ${company.name}`);
    console.log(`Usuario: ${owner.email}`);
  } catch (error) {
    console.error('Error preparando la base de pruebas:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void seedTestDatabase();
