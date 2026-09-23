import type { PaymentMethod, TenantPlan } from '@prisma/client';
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { deriveReceivableStatus } from '../domain/receivableStatus';
import { addDays, startOfMonth, todayInTimezone } from '../lib/dates';
import { logger } from '../lib/logger';
import { roundMoney } from '../lib/money';
import { basePrisma } from '../lib/prisma';
import { runWithTenant } from '../lib/tenantContext';
import { tenantRepository } from '../repositories/tenant.repository';
import { monthlyReportService } from '../services/monthlyReport.service';

export const DEMO_PASSWORD = 'Password123!';

type Profile = 'punctual' | 'late' | 'defaulter' | 'new' | 'mixed';

interface ReceivablePlan {
  description: string;
  amount: number;
  /** Due date relative to today, in days. */
  dueIn: number;
  payments: Array<{ ratio: number; paidIn: number; method: PaymentMethod }>;
}

interface TenantSeed {
  name: string;
  industry: string;
  plan: TenantPlan;
  domain: string;
  adminName: string;
  collectorName: string;
  customers: Array<{
    name: string;
    phone: string;
    documentId?: string;
    notes?: string;
    profile: Profile;
  }>;
}

const TENANTS: TenantSeed[] = [
  {
    name: 'Bodega San Martin',
    industry: 'Retail',
    plan: 'starter',
    domain: 'bodegasanmartin.pe',
    adminName: 'Rosa Huaman',
    collectorName: 'Carlos Rojas',
    customers: [
      { name: 'Maria Quispe', phone: '+51987654321', documentId: '45678912', profile: 'punctual' },
      { name: 'Jorge Mendoza', phone: '+51976543210', documentId: '41234567', profile: 'late' },
      {
        name: 'Lucia Torres',
        phone: '+51965432109',
        profile: 'defaulter',
        notes: 'Prefers calls after 6 pm.',
      },
      { name: 'Pedro Castillo', phone: '+51954321098', documentId: '43219876', profile: 'new' },
      { name: 'Ana Flores', phone: '+51943210987', profile: 'mixed' },
    ],
  },
  {
    name: 'Ferreteria El Constructor',
    industry: 'Hardware',
    plan: 'pro',
    domain: 'elconstructor.pe',
    adminName: 'Miguel Vargas',
    collectorName: 'Sofia Chavez',
    customers: [
      {
        name: 'Constructora Los Andes SAC',
        phone: '+51912345678',
        documentId: '20512345678',
        profile: 'late',
      },
      {
        name: 'Inversiones Pacifico EIRL',
        phone: '+51923456789',
        documentId: '20598765432',
        profile: 'punctual',
      },
      {
        name: 'Raul Gutierrez',
        phone: '+51934567890',
        documentId: '40987654',
        profile: 'defaulter',
      },
      { name: 'Carmen Salazar', phone: '+51945678901', profile: 'mixed' },
      {
        name: 'Obras y Proyectos Lima SAC',
        phone: '+51956789012',
        documentId: '20611122233',
        profile: 'new',
      },
      {
        name: 'Hector Paredes',
        phone: '+51967890123',
        profile: 'punctual',
        notes: 'Pays by bank transfer.',
      },
    ],
  },
  {
    name: 'Distribuidora Andina',
    industry: 'Wholesale',
    plan: 'free',
    domain: 'distribuidoraandina.pe',
    adminName: 'Elena Ramos',
    collectorName: 'Diego Soto',
    customers: [
      { name: 'Minimarket La Esquina', phone: '+51978901234', profile: 'mixed' },
      {
        name: 'Restaurante El Sabor',
        phone: '+51989012345',
        documentId: '20456789123',
        profile: 'defaulter',
      },
      { name: 'Panaderia Santa Rosa', phone: '+51990123456', profile: 'punctual' },
      { name: 'Bodega Dona Julia', phone: '+51901234567', profile: 'late' },
    ],
  },
];

/** Receivable plans per payment behavior. Offsets are relative to today. */
function plansFor(profile: Profile, base: number): ReceivablePlan[] {
  const amount = (factor: number) => roundMoney(base * factor);
  switch (profile) {
    case 'punctual':
      return [
        {
          description: 'Monthly supply - July',
          amount: amount(1),
          dueIn: -60,
          payments: [{ ratio: 1, paidIn: -62, method: 'yape' }],
        },
        {
          description: 'Monthly supply - August',
          amount: amount(1.1),
          dueIn: -30,
          payments: [{ ratio: 1, paidIn: -31, method: 'bank_transfer' }],
        },
        {
          description: 'Special order',
          amount: amount(0.6),
          dueIn: -8,
          payments: [
            { ratio: 0.5, paidIn: -15, method: 'plin' },
            { ratio: 0.5, paidIn: -9, method: 'plin' },
          ],
        },
        { description: 'Monthly supply - September', amount: amount(1.2), dueIn: 3, payments: [] },
      ];
    case 'late':
      return [
        {
          description: 'Invoice F001-0102',
          amount: amount(1.4),
          dueIn: -75,
          payments: [{ ratio: 1, paidIn: -58, method: 'bank_transfer' }],
        },
        {
          description: 'Invoice F001-0145',
          amount: amount(0.9),
          dueIn: -40,
          payments: [
            { ratio: 0.5, paidIn: -35, method: 'cash' },
            { ratio: 0.5, paidIn: -22, method: 'cash' },
          ],
        },
        {
          description: 'Invoice F001-0188',
          amount: amount(1.3),
          dueIn: -6,
          payments: [{ ratio: 0.4, paidIn: -4, method: 'yape' }],
        },
        { description: 'Invoice F001-0210', amount: amount(1), dueIn: 10, payments: [] },
      ];
    case 'defaulter':
      return [
        {
          description: 'Credit sale - June',
          amount: amount(0.8),
          dueIn: -90,
          payments: [{ ratio: 1, paidIn: -50, method: 'cash' }],
        },
        { description: 'Credit sale - July', amount: amount(1.1), dueIn: -45, payments: [] },
        {
          description: 'Credit sale - August',
          amount: amount(1.25),
          dueIn: -21,
          payments: [{ ratio: 0.2, paidIn: -18, method: 'yape' }],
        },
        { description: 'Credit sale - September', amount: amount(0.7), dueIn: -9, payments: [] },
      ];
    case 'new':
      return [
        { description: 'First order', amount: amount(1.5), dueIn: 0, payments: [] },
        {
          description: 'Second order',
          amount: amount(0.9),
          dueIn: 20,
          payments: [{ ratio: 0.3, paidIn: -1, method: 'plin' }],
        },
      ];
    case 'mixed':
      return [
        {
          description: 'Order #1001',
          amount: amount(1),
          dueIn: -35,
          payments: [{ ratio: 1, paidIn: -36, method: 'yape' }],
        },
        { description: 'Order #1027', amount: amount(0.75), dueIn: -3, payments: [] },
        { description: 'Order #1054', amount: amount(1.15), dueIn: 2, payments: [] },
        { description: 'Order #1080', amount: amount(0.5), dueIn: 45, payments: [] },
      ];
  }
}

async function seedTenant(
  seed: TenantSeed,
  tenantIndex: number,
  passwordHash: string,
  today: Date,
) {
  const { tenant } = await tenantRepository.createWithAdmin({
    tenant: { name: seed.name, industry: seed.industry, plan: seed.plan },
    admin: { name: seed.adminName, email: `admin@${seed.domain}`, passwordHash },
  });
  await basePrisma.user.create({
    data: {
      tenantId: tenant.id,
      name: seed.collectorName,
      email: `collector@${seed.domain}`,
      passwordHash,
      role: 'collector',
    },
  });

  let receivableCount = 0;
  for (const [customerIndex, customerSeed] of seed.customers.entries()) {
    const { profile, ...customerData } = customerSeed;
    const customer = await basePrisma.customer.create({
      data: { ...customerData, tenantId: tenant.id },
    });

    const base = 250 + tenantIndex * 400 + customerIndex * 135;
    for (const plan of plansFor(profile, base)) {
      const dueDate = addDays(today, plan.dueIn);
      const payments = plan.payments.map((payment) => ({
        amount: roundMoney(plan.amount * payment.ratio),
        date: addDays(today, payment.paidIn),
        method: payment.method,
      }));
      const paidAmount = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));

      await basePrisma.receivable.create({
        data: {
          tenantId: tenant.id,
          customerId: customer.id,
          description: plan.description,
          totalAmount: plan.amount,
          paidAmount,
          issueDate: addDays(dueDate, -30),
          dueDate,
          status: deriveReceivableStatus({ totalAmount: plan.amount, paidAmount, dueDate }, today),
          payments: { create: payments },
        },
      });
      receivableCount += 1;
    }
  }

  // Previous month's report so the dashboard has history from day one.
  await runWithTenant(tenant.id, () =>
    monthlyReportService.generateForCurrentTenant(addDays(startOfMonth(today), -1)),
  );

  logger.info(
    `Seeded "${seed.name}": ${seed.customers.length} customers, ${receivableCount} receivables ` +
      `(login: admin@${seed.domain} / ${DEMO_PASSWORD})`,
  );
}

export async function seed() {
  const today = todayInTimezone(env.APP_TIMEZONE);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  for (const [index, tenant] of TENANTS.entries()) {
    await seedTenant(tenant, index, passwordHash, today);
  }
}

/** Seeds demo data only when the database has no tenants (safe to run on every start). */
export async function seedIfEmpty() {
  const tenants = await basePrisma.tenant.count();
  if (tenants > 0) {
    logger.info(`Database already contains ${tenants} tenant(s); skipping seed`);
    return false;
  }
  logger.info('Empty database detected; seeding demo data');
  await seed();
  return true;
}

async function runCli() {
  const force = process.argv.includes('--force');
  if (force) {
    logger.warn('--force: deleting all existing data');
    await basePrisma.tenant.deleteMany(); // Cascades to every tenant-owned table.
    await seed();
  } else if (!(await seedIfEmpty())) {
    logger.info('Run "npm run db:seed -- --force" to wipe the database and reseed.');
  }
}

if (require.main === module) {
  runCli()
    .catch((error: unknown) => {
      logger.error('Seed failed', error);
      process.exitCode = 1;
    })
    .finally(() => basePrisma.$disconnect());
}
