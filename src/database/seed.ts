import type {
  AccessRequestStatus,
  PaymentMethod,
  ProductUnit,
  TenantModule,
  TenantPlan,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { deriveReceivableStatus } from '../domain/receivableStatus';
import { addDays, startOfMonth, todayInTimezone } from '../lib/dates';
import { logger } from '../lib/logger';
import { roundMoney } from '../lib/money';
import { basePrisma } from '../lib/prisma';
import { runWithTenant } from '../lib/tenantContext';
import { platformAdminRepository } from '../repositories/platformAdmin.repository';
import { tenantRepository } from '../repositories/tenant.repository';
import { monthlyReportService } from '../services/monthlyReport.service';
import { passwordSchema } from '../validators/auth.schemas';

export const DEMO_PASSWORD = 'Password123!';
export const DEFAULT_PLATFORM_ADMIN_EMAIL = 'admin@solvia.app';

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
  /** Optional modules enabled for the demo (the catalog comes with any of them). */
  modules?: TenantModule[];
  products?: Array<{
    name: string;
    code?: string;
    unit?: ProductUnit;
    price: number;
    cost?: number;
    trackStock?: boolean;
    minStock?: number;
  }>;
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
    industry: 'Bodega o minimarket',
    plan: 'starter',
    domain: 'bodegasanmartin.pe',
    modules: ['sales', 'inventory'],
    products: [
      { name: 'Arroz Costeño 5 kg', code: '7750243000011', price: 24.5, cost: 21, minStock: 5 },
      { name: 'Aceite Primor 1 L', code: '7751271000152', price: 11.9, cost: 10.2, minStock: 6 },
      { name: 'Azúcar rubia', unit: 'kg', price: 4.2, cost: 3.6, minStock: 10 },
      {
        name: 'Gaseosa Inca Kola 1.5 L',
        code: '7750182002271',
        price: 6.5,
        cost: 5.3,
        minStock: 12,
      },
      { name: 'Leche Gloria tarro', code: '7751271011462', price: 4.6, cost: 4, minStock: 24 },
      { name: 'Huevos', unit: 'kg', price: 8.5, cost: 7.2, minStock: 5 },
      { name: 'Pan francés', price: 0.3, trackStock: false },
      {
        name: 'Detergente Bolívar 1 kg',
        code: '7750068000119',
        price: 13.9,
        cost: 11.8,
        minStock: 4,
      },
    ],
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
    industry: 'Ferretería',
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
    industry: 'Distribuidora o mayorista',
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

interface AccessRequestSeed {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  industry?: string;
  message?: string;
  status: AccessRequestStatus;
  /** Submission date relative to today, in days. */
  createdIn: number;
}

/** "Request access" submissions from the landing page, waiting in the backoffice. */
const ACCESS_REQUESTS: AccessRequestSeed[] = [
  {
    businessName: 'Botica Santa Rosa',
    contactName: 'Julia Condori',
    email: 'julia.condori@boticasantarosa.pe',
    phone: '+51 954 123 456',
    industry: 'Farmacia o botica',
    message:
      'Plan de interés: Starter\nTenemos una botica en Cayma, Arequipa, y fiamos a unos 60 clientes ' +
      'frecuentes. Llevamos todo en un cuaderno y queremos enviar recordatorios por WhatsApp.',
    status: 'pending',
    createdIn: -1,
  },
  {
    businessName: 'Ferreteria Norte Trujillo',
    contactName: 'Victor Alvarado',
    email: 'valvarado@ferreterianorte.pe',
    phone: '+51 944 876 210',
    industry: 'Ferretería',
    message:
      'Plan de interés: Pro\nFerretería en Trujillo. Muchos maestros de obra pagan a 30 días y ' +
      'perdemos la cuenta de quién está atrasado. ¿Hay un plan para dos cobradores?',
    status: 'pending',
    createdIn: -3,
  },
  {
    businessName: 'Restaurante La Sazon de Mama',
    contactName: 'Rocio Paredes',
    email: 'rocio@lasazondemama.pe',
    phone: '+51 987 222 314',
    industry: 'Restaurante o cafetería',
    message: 'Restaurante en Surquillo, Lima. Damos crédito mensual de menú a oficinas cercanas.',
    status: 'pending',
    createdIn: -6,
  },
  {
    businessName: 'Minimarket Los Olivos',
    contactName: 'Hugo Salas',
    email: 'hugo.salas@gmail.com',
    phone: '+51 912 345 000',
    industry: 'Bodega o minimarket',
    status: 'dismissed',
    createdIn: -20,
  },
];

async function seedAccessRequests(today: Date) {
  for (const { createdIn, ...request } of ACCESS_REQUESTS) {
    // Midday local time (UTC-5) so the date shown in the backoffice matches the offset.
    const createdAt = new Date(addDays(today, createdIn).getTime() + 17 * 60 * 60 * 1000);
    await basePrisma.accessRequest.create({ data: { ...request, createdAt } });
  }
  logger.info(`Seeded ${ACCESS_REQUESTS.length} access requests`);
}

/** Receivable plans per payment behavior. Offsets are relative to today. */
function plansFor(profile: Profile, base: number): ReceivablePlan[] {
  const amount = (factor: number) => roundMoney(base * factor);
  switch (profile) {
    case 'punctual':
      return [
        {
          description: 'Opening order',
          amount: amount(0.9),
          dueIn: -150,
          payments: [{ ratio: 1, paidIn: -152, method: 'bank_transfer' }],
        },
        {
          description: 'Monthly supply - June',
          amount: amount(1.05),
          dueIn: -95,
          payments: [{ ratio: 1, paidIn: -96, method: 'yape' }],
        },
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
          description: 'Invoice F001-0055',
          amount: amount(1.2),
          dueIn: -160,
          payments: [{ ratio: 1, paidIn: -141, method: 'bank_transfer' }],
        },
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
          description: 'Credit sale - April',
          amount: amount(0.9),
          dueIn: -150,
          payments: [
            { ratio: 0.5, paidIn: -135, method: 'cash' },
            { ratio: 0.5, paidIn: -112, method: 'cash' },
          ],
        },
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
          description: 'Order #0950',
          amount: amount(0.85),
          dueIn: -125,
          payments: [{ ratio: 1, paidIn: -126, method: 'plin' }],
        },
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
    admin: {
      name: seed.adminName,
      email: `admin@${seed.domain}`,
      passwordHash,
      mustChangePassword: false,
    },
  });
  if (seed.modules?.length) {
    await basePrisma.tenant.update({ where: { id: tenant.id }, data: { modules: seed.modules } });
  }
  if (seed.products?.length) {
    await basePrisma.product.createMany({
      data: seed.products.map((product) => ({ ...product, tenantId: tenant.id })),
    });
  }
  await basePrisma.user.create({
    data: {
      tenantId: tenant.id,
      name: seed.collectorName,
      email: `collector@${seed.domain}`,
      passwordHash,
      role: 'collector',
      active: true,
      mustChangePassword: false,
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

/**
 * Creates the platform (backoffice) admin, or updates its name and password when it already
 * exists. Credentials come from PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD when set.
 */
export async function seedPlatformAdmin() {
  const email = (env.PLATFORM_ADMIN_EMAIL ?? DEFAULT_PLATFORM_ADMIN_EMAIL).toLowerCase().trim();
  const password = passwordSchema.parse(env.PLATFORM_ADMIN_PASSWORD ?? DEMO_PASSWORD);
  await platformAdminRepository.upsert({
    email,
    name: 'Solvia Admin',
    passwordHash: await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS),
  });
  logger.info(
    `Platform admin ready (login: ${email}${env.PLATFORM_ADMIN_PASSWORD ? '' : ` / ${DEMO_PASSWORD}`})`,
  );
}

export async function seed() {
  const today = todayInTimezone(env.APP_TIMEZONE);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  for (const [index, tenant] of TENANTS.entries()) {
    await seedTenant(tenant, index, passwordHash, today);
  }
  await seedAccessRequests(today);
}

/**
 * Seeds demo data only when the database has no tenants (safe to run on every start).
 * The platform admin is always upserted.
 */
export async function seedIfEmpty() {
  await seedPlatformAdmin();
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
    await basePrisma.accessRequest.deleteMany();
    await seedPlatformAdmin();
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
