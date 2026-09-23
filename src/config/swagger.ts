import path from 'node:path';
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

/**
 * OpenAPI document generated from the `@openapi` JSDoc annotations in the route files.
 * Scans `.ts` sources in development and compiled `.js` files in production builds.
 */
export const openApiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Solvia API',
      version: '1.0.0',
      description:
        'Multi-tenant credit management and collections API. Authenticate with `POST /auth/login` and use the access token as a Bearer token.',
    },
    servers: [{ url: `${env.PUBLIC_API_URL}/api` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      parameters: {
        Id: { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        Page: { in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
        PageSize: {
          in: 'query',
          name: 'pageSize',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      responses: {
        Unauthorized: errorResponse('Missing or invalid access token'),
        Forbidden: errorResponse('The user role is not allowed to perform this action'),
        NotFound: errorResponse('Resource not found'),
        Conflict: errorResponse('Conflicting resource'),
        ValidationError: errorResponse('Request validation failed'),
        Unprocessable: errorResponse('Business rule violation'),
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string' },
                details: {},
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        TokenPair: {
          type: 'object',
          properties: { accessToken: { type: 'string' }, refreshToken: { type: 'string' } },
        },
        AuthSession: {
          allOf: [
            { $ref: '#/components/schemas/TokenPair' },
            {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string', enum: ['admin', 'collector'] },
                    tenantId: { type: 'string' },
                  },
                },
              },
            },
          ],
        },
        CustomerInput: {
          type: 'object',
          required: ['name', 'phone'],
          properties: {
            name: { type: 'string', example: 'Maria Quispe' },
            phone: {
              type: 'string',
              example: '+51987654321',
              description: 'E.164, with country code',
            },
            documentId: { type: 'string', nullable: true, example: '45678912' },
            notes: { type: 'string', nullable: true },
          },
        },
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            phone: { type: 'string' },
            documentId: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        RiskScore: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ['low', 'medium', 'high'] },
            points: { type: 'integer', minimum: 0, maximum: 6 },
            metrics: {
              type: 'object',
              properties: {
                evaluatedReceivables: { type: 'integer' },
                onTimeRate: { type: 'number', nullable: true },
                averageDaysOverdue: { type: 'number' },
                currentOverdueCount: { type: 'integer' },
              },
            },
          },
        },
        CustomerWithRisk: {
          allOf: [
            { $ref: '#/components/schemas/Customer' },
            {
              type: 'object',
              properties: {
                risk: { $ref: '#/components/schemas/RiskScore' },
                summary: {
                  type: 'object',
                  properties: {
                    totalBilled: { type: 'number' },
                    totalPaid: { type: 'number' },
                    totalOutstanding: { type: 'number' },
                    openReceivables: { type: 'integer' },
                    overdueReceivables: { type: 'integer' },
                  },
                },
              },
            },
          ],
        },
        ReceivableInput: {
          type: 'object',
          required: ['customerId', 'description', 'totalAmount', 'issueDate', 'dueDate'],
          properties: {
            customerId: { type: 'string', format: 'uuid' },
            description: { type: 'string', example: 'Invoice F001-000123' },
            totalAmount: { type: 'number', example: 850 },
            issueDate: { type: 'string', format: 'date', example: '2026-09-01' },
            dueDate: { type: 'string', format: 'date', example: '2026-09-30' },
          },
        },
        Receivable: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            customerId: { type: 'string', format: 'uuid' },
            customer: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string' },
              },
            },
            description: { type: 'string' },
            totalAmount: { type: 'number' },
            paidAmount: { type: 'number' },
            outstandingAmount: { type: 'number' },
            issueDate: { type: 'string', format: 'date' },
            dueDate: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['pending', 'partial', 'paid', 'overdue'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            receivableId: { type: 'string', format: 'uuid' },
            amount: { type: 'number' },
            date: { type: 'string', format: 'date' },
            method: { type: 'string', enum: ['yape', 'plin', 'cash', 'bank_transfer'] },
            proofUrl: { type: 'string', nullable: true },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            receivableId: { type: 'string', format: 'uuid' },
            channel: { type: 'string', enum: ['whatsapp'] },
            templateType: {
              type: 'string',
              enum: ['pre_due_reminder', 'due_reminder', 'overdue_reminder', 'statement'],
            },
            status: { type: 'string', enum: ['sent', 'failed'] },
            sentAt: { type: 'string', format: 'date-time' },
            sentContent: { type: 'string' },
          },
        },
        ReminderRules: {
          type: 'object',
          required: ['enabled', 'daysBeforeDue', 'onDueDate', 'overdueEveryDays'],
          properties: {
            enabled: { type: 'boolean', example: true },
            daysBeforeDue: { type: 'integer', minimum: 0, maximum: 30, example: 3 },
            onDueDate: { type: 'boolean', example: true },
            overdueEveryDays: { type: 'integer', minimum: 0, maximum: 30, example: 3 },
          },
        },
        CashFlow: {
          type: 'object',
          properties: {
            currency: { type: 'string', example: 'PEN' },
            groupBy: { type: 'string', enum: ['week', 'month'] },
            overdue: {
              type: 'object',
              properties: { amount: { type: 'number' }, count: { type: 'integer' } },
            },
            buckets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  start: { type: 'string', format: 'date' },
                  end: { type: 'string', format: 'date' },
                  amount: { type: 'number' },
                  count: { type: 'integer' },
                },
              },
            },
            later: {
              type: 'object',
              properties: { amount: { type: 'number' }, count: { type: 'integer' } },
            },
            totalOutstanding: { type: 'number' },
          },
        },
        MonthlyReport: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            period: { type: 'string', example: '2026-09' },
            totalCollected: { type: 'number' },
            totalPending: { type: 'number' },
            topOverdueCustomers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  customerId: { type: 'string' },
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  overdueAmount: { type: 'number' },
                  overdueCount: { type: 'integer' },
                },
              },
            },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  // Glob patterns require forward slashes, even on Windows.
  apis: ['*.ts', '*.js'].map((pattern) =>
    path.join(__dirname, '..', 'routes', pattern).split(path.sep).join('/'),
  ),
});
