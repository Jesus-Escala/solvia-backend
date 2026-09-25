-- Cobranza becomes a module like Ventas and Inventario (a business may buy any of them).
ALTER TYPE "TenantModule" ADD VALUE IF NOT EXISTS 'collections' BEFORE 'sales';
