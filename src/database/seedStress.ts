import { randomUUID } from 'node:crypto';
import type { MessageTemplateType, PaymentMethod, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { deriveReceivableStatus } from '../domain/receivableStatus';
import { DEFAULT_TEMPLATES, renderTemplate } from '../domain/template';
import {
  addDays,
  diffInDays,
  formatDisplayDate,
  startOfMonth,
  todayInTimezone,
} from '../lib/dates';
import { logger } from '../lib/logger';
import { formatMoney, roundMoney } from '../lib/money';
import { basePrisma } from '../lib/prisma';
import { runWithTenant } from '../lib/tenantContext';
import { tenantRepository } from '../repositories/tenant.repository';
import { monthlyReportService } from '../services/monthlyReport.service';
import { DEMO_PASSWORD } from './seed';

/**
 * Stress data: one big business ("Comercial Grande SAC") with ~1,000 customers, ~15,000
 * receivables over the last 24 months plus the next 3, ~20,000 payments and ~100 notifications.
 * Used to check that the dashboards stay fast with a lot of data.
 *
 * Idempotent: it deletes and recreates ONLY this tenant (found by name or by its users' emails);
 * the other demo tenants are never touched. Deterministic: a seeded PRNG drives every choice
 * (dates are relative to today, so the data "moves" with the calendar).
 *
 *   npm run db:seed:stress
 */

const TENANT = {
  name: 'Comercial Grande SAC',
  industry: 'Distribuidora o mayorista',
  plan: 'pro' as const,
};
const ADMIN = { name: 'Patricia Salinas', email: 'admin@comercialgrande.pe' };
const COLLECTOR = { name: 'Luis Arana', email: 'cobranza@comercialgrande.pe' };

const CUSTOMERS = 1_000;
const RECEIVABLES = 15_000;
const NOTIFICATIONS = 100;
const HISTORY_DAYS = 730; // ~24 months
const BATCH_SIZE = 2_000;

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, seedable PRNG returning [0, 1). */
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20260926);
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (probability: number) => random() < probability;
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
function weighted<T>(options: ReadonlyArray<readonly [T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1]![0];
}
/** Log-uniform value in [min, max]: many small amounts, a few large ones. */
const logUniform = (min: number, max: number) =>
  Math.exp(Math.log(min) + random() * Math.log(max / min));
const digits = (count: number) => Array.from({ length: count }, () => int(0, 9)).join('');

// ---------------------------------------------------------------------------
// Realistic Peruvian customers
// ---------------------------------------------------------------------------

const FIRST_NAMES = (
  'Maria Rosa Carmen Ana Lucia Juana Elena Julia Patricia Silvia Gladys Milagros ' +
  'Yolanda Veronica Karina Roxana Sofia Valeria Flor Norma Luz Diana Teresa Beatriz ' +
  'Jose Juan Luis Carlos Jorge Miguel Pedro Victor Cesar Raul Hector Manuel Javier ' +
  'Ricardo Fernando Oscar Walter Hugo Alberto Julio Edwin Wilmer Percy Freddy Diego ' +
  'Andres Renzo Kevin Marco Alex Jhon Segundo'
).split(' ');
const LAST_NAMES = (
  'Quispe Flores Sanchez Rodriguez Garcia Huaman Mamani Rojas Chavez Ramos Torres Diaz ' +
  'Mendoza Vargas Castillo Gutierrez Espinoza Lopez Condori Ramirez Cruz Perez Vasquez ' +
  'Salazar Paredes Huaranga Ccori Apaza Choque Ticona Villanueva Cardenas Alvarado ' +
  'Gonzales Romero Silva Reyes Morales Aguilar Palomino Soto Medina Cahuana Inga ' +
  'Chambi Yupanqui Tello Zapata Arias Ponce Ore Cordova Nunez Carbajal Luque Mejia ' +
  'Bustamante Solis Valdivia Arce'
).split(' ');
const BUSINESS_TYPES = (
  'Bodega Minimarket Comercial Distribuidora Inversiones Restaurante Botica Ferreteria ' +
  'Panaderia Libreria Multiservicios Negociaciones Importaciones'
).split(' ');
const BUSINESS_NAMES = (
  'San Juan, Los Andes, El Sol, Santa Rosa, La Esperanza, Virgen de Chapi, ' +
  'Señor de los Milagros, El Progreso, Los Olivos, San Martin, Pachacutec, ' +
  'La Economica, El Norteño, Mi Peru, Santa Anita, Las Palmeras, Don Lucho, ' +
  'Doña Carmen, El Chalan, Los Pinos, San Isidro, La Victoria, Surquillo, El Porvenir'
).split(', ');
const BUSINESS_SUFFIXES = ['SAC', 'EIRL', 'SRL', 'SAC', 'EIRL'];

/** RUC check digit (SUNAT modulo 11). */
function rucCheckDigit(base10: string): number {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(base10[index]), 0);
  const digit = 11 - (sum % 11);
  return digit === 10 ? 0 : digit === 11 ? 1 : digit;
}
const ruc = (prefix: '10' | '20', body: string) => {
  const base = `${prefix}${body}`;
  return `${base}${rucCheckDigit(base)}`;
};
const dni = () => `${int(1, 7)}${digits(7)}`;

type Profile = 'punctual' | 'late' | 'partial' | 'defaulter';

interface CustomerPlan {
  id: string;
  name: string;
  phone: string;
  documentId: string | null;
  isCompany: boolean;
  profile: Profile;
  createdAt: Date;
  /** First day it can have receivables (its creation day, local). */
  since: Date;
  /** Relative purchase volume (a few big buyers, many small ones). */
  weight: number;
  /** Typical invoice amount. */
  baseAmount: number;
  /** Usual credit term in days. */
  term: number;
  favoriteMethod: PaymentMethod;
}

function buildCustomers(today: Date): CustomerPlan[] {
  const phones = new Set<string>();
  const customers: CustomerPlan[] = [];
  for (let index = 0; index < CUSTOMERS; index += 1) {
    const isCompany = chance(0.22);
    const person = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${pick(LAST_NAMES)}`;
    const name = isCompany
      ? `${pick(BUSINESS_TYPES)} ${pick(BUSINESS_NAMES)} ${pick(BUSINESS_SUFFIXES)}`
      : person;
    const personDni = dni();
    const documentId = isCompany
      ? ruc('20', digits(8))
      : weighted<string | null>([
          [personDni, 70],
          [ruc('10', personDni), 15],
          [null, 15],
        ]);

    let phone: string;
    do phone = `+519${digits(8)}`;
    while (phones.has(phone));
    phones.add(phone);

    // A third of the base existed before the history window; the rest joined over 24 months.
    const ageDays =
      index < CUSTOMERS / 3 ? int(HISTORY_DAYS, HISTORY_DAYS + 60) : int(0, HISTORY_DAYS);
    const since = addDays(today, -ageDays);
    // Business hours in Lima (UTC-5): 09:00-19:00 local.
    const createdAt = new Date(since.getTime() + int(14, 23) * 3_600_000 + int(0, 59) * 60_000);

    customers.push({
      id: randomUUID(),
      name,
      phone,
      documentId,
      isCompany,
      profile: weighted<Profile>([
        ['punctual', 45],
        ['late', 29],
        ['partial', 17],
        ['defaulter', 9],
      ]),
      createdAt,
      since: addDays(today, -Math.min(ageDays, HISTORY_DAYS)),
      weight: (isCompany ? 2.5 : 1) * logUniform(0.3, 6),
      baseAmount: isCompany ? logUniform(400, 3_500) : logUniform(60, 1_200),
      term: pick(isCompany ? [15, 30, 30, 45, 60] : [7, 7, 15, 15, 30]),
      favoriteMethod: isCompany
        ? weighted<PaymentMethod>([
            ['bank_transfer', 70],
            ['yape', 15],
            ['cash', 15],
          ])
        : weighted<PaymentMethod>([
            ['yape', 50],
            ['plin', 25],
            ['cash', 20],
            ['bank_transfer', 5],
          ]),
    });
  }
  return customers;
}

// ---------------------------------------------------------------------------
// Receivables and payments
// ---------------------------------------------------------------------------

function paymentMethod(customer: CustomerPlan, amount: number): PaymentMethod {
  if (chance(0.55)) {
    // Wallets have daily limits: large payments by Yape/Plin are rare.
    if (
      amount <= 2_000 ||
      customer.favoriteMethod === 'bank_transfer' ||
      customer.favoriteMethod === 'cash'
    ) {
      return customer.favoriteMethod;
    }
  }
  if (amount <= 500) {
    return weighted<PaymentMethod>([
      ['yape', 48],
      ['plin', 22],
      ['cash', 22],
      ['bank_transfer', 8],
    ]);
  }
  if (amount <= 2_000) {
    return weighted<PaymentMethod>([
      ['yape', 22],
      ['plin', 10],
      ['cash', 18],
      ['bank_transfer', 50],
    ]);
  }
  return weighted<PaymentMethod>([
    ['bank_transfer', 85],
    ['cash', 10],
    ['yape', 5],
  ]);
}

/**
 * Weekday pattern: few payments on Sundays (most move to Monday), fewer on Saturdays, and a
 * small end-of-week push to Friday.
 */
function adjustWeekday(date: Date): Date {
  const weekday = date.getUTCDay(); // 0 = Sunday
  if (weekday === 0 && chance(0.7)) return addDays(date, 1);
  if (weekday === 6 && chance(0.35)) return addDays(date, chance(0.5) ? -1 : 2);
  if (weekday === 4 && chance(0.15)) return addDays(date, 1);
  return date;
}

/** Splits `amount` into `parts` installments (cents exact, last one takes the remainder). */
function split(amount: number, parts: number): number[] {
  const shares = Array.from({ length: parts }, () => 0.5 + random());
  const total = shares.reduce((sum, share) => sum + share, 0);
  const amounts = shares.map((share) => roundMoney((amount * share) / total));
  amounts[parts - 1] = roundMoney(
    amount - amounts.slice(0, -1).reduce((sum, value) => sum + value, 0),
  );
  return amounts;
}

interface PlannedPayment {
  amount: number;
  offset: number; // days after the due date (negative = before)
}

/** Installments a customer of `profile` makes for an invoice of `amount` with `term` days. */
function paymentPlan(profile: Profile, amount: number, term: number): PlannedPayment[] {
  const spread = (total: number, parts: number, from: number, to: number) =>
    split(total, parts)
      .map((value) => ({ amount: value, offset: int(from, to) }))
      .sort((a, b) => a.offset - b.offset);

  switch (profile) {
    case 'punctual':
      if (chance(0.08)) return [{ amount, offset: int(1, 10) }];
      if (chance(0.15)) return spread(amount, 2, -Math.min(term, 20), 0);
      return [{ amount, offset: -int(0, Math.min(term, 7)) }];
    case 'late':
      if (chance(0.35)) return spread(amount, int(2, 3), -5, 45);
      return [{ amount, offset: int(3, 45) }];
    case 'partial': {
      const settles = chance(0.7);
      const paid = settles ? amount : roundMoney(amount * (0.3 + random() * 0.6));
      return spread(paid, int(2, 4), -Math.min(term, 10), settles ? 60 : 40);
    }
    case 'defaulter': {
      if (chance(0.3)) return [];
      if (chance(0.64))
        return spread(roundMoney(amount * (0.1 + random() * 0.5)), int(1, 2), 5, 90);
      return [{ amount, offset: int(30, 120) }];
    }
  }
}

function roundAmount(value: number): number {
  const clamped = Math.min(8_000, Math.max(50, value));
  // Most tickets are round amounts (S/ 0.50 steps); some keep their cents.
  return chance(0.6) ? Math.round(clamped * 2) / 2 : roundMoney(clamped);
}

function buildPortfolio(customers: CustomerPlan[], today: Date) {
  // Pick the customer of every receivable proportionally to weight x months active.
  const cumulative: number[] = [];
  let total = 0;
  for (const customer of customers) {
    total += customer.weight * (diffInDays(today, customer.since) + 30);
    cumulative.push(total);
  }
  const pickCustomer = () => {
    const roll = random() * total;
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (cumulative[mid]! < roll) low = mid + 1;
      else high = mid;
    }
    return customers[low]!;
  };

  const receivables: Prisma.ReceivableCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const counters = { factura: 0, boleta: 0 };

  for (let index = 0; index < RECEIVABLES; index += 1) {
    const customer = pickCustomer();
    // Issued between the customer's first day and 30 days ahead (scheduled invoices), so due
    // dates reach about 3 months into the future.
    const issueDate = addDays(customer.since, int(0, diffInDays(today, customer.since) + 30));
    const term = chance(0.8) ? customer.term : int(7, 60);
    const dueDate = addDays(issueDate, term);
    const totalAmount = roundAmount(customer.baseAmount * Math.exp((random() - 0.5) * 1.2));

    const receivableId = randomUUID();
    let paidAmount = 0;
    for (const planned of paymentPlan(customer.profile, totalAmount, term)) {
      let date = adjustWeekday(addDays(dueDate, planned.offset));
      if (date.getTime() < issueDate.getTime()) date = issueDate;
      if (date.getTime() > today.getTime()) continue; // Not paid yet.
      paidAmount = roundMoney(paidAmount + planned.amount);
      payments.push({
        id: randomUUID(),
        receivableId,
        amount: planned.amount,
        date,
        method: paymentMethod(customer, planned.amount),
      });
    }

    const isFactura = customer.isCompany || chance(0.2);
    const number = isFactura ? ++counters.factura : ++counters.boleta;
    receivables.push({
      id: receivableId,
      tenantId: '', // set once the tenant exists
      customerId: customer.id,
      description: isFactura
        ? `Factura F001-${String(number).padStart(6, '0')}`
        : `Boleta B001-${String(number).padStart(6, '0')}`,
      totalAmount,
      paidAmount,
      issueDate,
      dueDate,
      status: deriveReceivableStatus({ totalAmount, paidAmount, dueDate }, today),
      createdAt: new Date(Math.min(Date.now(), issueDate.getTime() + int(14, 23) * 3_600_000)),
    });
  }
  return { receivables, payments };
}

function buildNotifications(
  customers: CustomerPlan[],
  receivables: Prisma.ReceivableCreateManyInput[],
  today: Date,
): Prisma.NotificationCreateManyInput[] {
  const byId = new Map(customers.map((customer) => [customer.id, customer]));
  const candidates = receivables.filter((receivable) => {
    const days = diffInDays(today, receivable.dueDate as Date);
    return receivable.status !== 'paid' && days >= -3 && days <= 60;
  });
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  for (let index = 0; index < NOTIFICATIONS && candidates.length > 0; index += 1) {
    const receivable = candidates.splice(int(0, candidates.length - 1), 1)[0]!;
    const dueDate = receivable.dueDate as Date;
    const daysOverdue = diffInDays(today, dueDate);
    const templateType: MessageTemplateType =
      daysOverdue > 0
        ? 'overdue_reminder'
        : daysOverdue === 0
          ? 'due_reminder'
          : 'pre_due_reminder';
    const sentOn = daysOverdue > 0 ? addDays(dueDate, int(1, daysOverdue)) : today;
    notifications.push({
      id: randomUUID(),
      receivableId: receivable.id!,
      channel: 'whatsapp',
      templateType,
      status: chance(0.93) ? 'sent' : 'failed',
      // 09:00-12:00 local, when the hourly reminder job usually runs.
      sentAt: new Date(sentOn.getTime() + int(14, 17) * 3_600_000),
      sentContent: renderTemplate(DEFAULT_TEMPLATES[templateType], {
        name: byId.get(receivable.customerId)?.name,
        business: TENANT.name,
        amount: formatMoney(
          roundMoney(Number(receivable.totalAmount) - Number(receivable.paidAmount)),
          env.CURRENCY,
        ),
        description: receivable.description,
        date: formatDisplayDate(dueDate),
        daysOverdue: Math.max(0, daysOverdue),
        paymentLink: `${env.PUBLIC_API_URL}/pay/${receivable.id}`,
      }),
    });
  }
  return notifications;
}

async function createInBatches<T>(rows: T[], create: (batch: T[]) => Promise<unknown>) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await create(rows.slice(start, start + BATCH_SIZE));
  }
}

export async function seedStress() {
  const startedAt = Date.now();
  const today = todayInTimezone(env.APP_TIMEZONE);

  // 1. Remove only this tenant (cascades to its users, customers, receivables, payments...).
  const removed = await basePrisma.tenant.deleteMany({
    where: {
      OR: [
        { name: TENANT.name },
        { users: { some: { email: { in: [ADMIN.email, COLLECTOR.email] } } } },
      ],
    },
  });
  if (removed.count > 0) logger.info(`Removed the previous "${TENANT.name}" tenant`);

  // 2. Tenant, admin, templates and reminder rules through the normal creation path.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_SALT_ROUNDS);
  const { tenant } = await tenantRepository.createWithAdmin({
    tenant: TENANT,
    admin: { ...ADMIN, passwordHash, mustChangePassword: false },
  });
  const tenantId = tenant.id;
  await basePrisma.tenant.update({
    where: { id: tenantId },
    data: { createdAt: addDays(today, -(HISTORY_DAYS + 70)) },
  });
  await basePrisma.user.create({
    data: {
      ...COLLECTOR,
      tenantId,
      passwordHash,
      role: 'collector',
      active: true,
      mustChangePassword: false,
    },
  });

  // 3. Customers, receivables, payments and notifications, generated in memory.
  const customers = buildCustomers(today);
  const { receivables, payments } = buildPortfolio(customers, today);
  for (const receivable of receivables) receivable.tenantId = tenantId;
  const notifications = buildNotifications(customers, receivables, today);

  await createInBatches(customers, (batch) =>
    basePrisma.customer.createMany({
      data: batch.map((customer) => ({
        id: customer.id,
        tenantId,
        name: customer.name,
        phone: customer.phone,
        documentId: customer.documentId,
        createdAt: customer.createdAt,
      })),
    }),
  );
  await createInBatches(receivables, (batch) => basePrisma.receivable.createMany({ data: batch }));
  await createInBatches(payments, (batch) => basePrisma.payment.createMany({ data: batch }));
  await createInBatches(notifications, (batch) =>
    basePrisma.notification.createMany({ data: batch }),
  );

  // Fresh statistics so the planner sees the bulk-loaded rows right away.
  await basePrisma.$executeRawUnsafe(
    'ANALYZE "customers", "receivables", "payments", "notifications"',
  );

  // 4. Previous month's report, like the regular demo seed.
  await runWithTenant(tenantId, () =>
    monthlyReportService.generateForCurrentTenant(addDays(startOfMonth(today), -1)),
  );

  const statuses = receivables.reduce<Record<string, number>>((counts, receivable) => {
    counts[receivable.status!] = (counts[receivable.status!] ?? 0) + 1;
    return counts;
  }, {});
  logger.info(
    `Seeded "${TENANT.name}": ${customers.length} customers, ${receivables.length} receivables ` +
      `(${Object.entries(statuses)
        .map(([status, count]) => `${count} ${status}`)
        .join(', ')}), ${payments.length} payments, ${notifications.length} notifications ` +
      `in ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
  );
  logger.info(
    `Logins: ${ADMIN.email} / ${DEMO_PASSWORD} (admin), ${COLLECTOR.email} / ${DEMO_PASSWORD} (collector)`,
  );
}

if (require.main === module) {
  seedStress()
    .catch((error: unknown) => {
      logger.error('Stress seed failed', error);
      process.exitCode = 1;
    })
    .finally(() => basePrisma.$disconnect());
}
