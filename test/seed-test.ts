import './setup-env';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';

async function seedTestDatabase() {
  const prisma = new PrismaService();

  try {
    await prisma.$connect();

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