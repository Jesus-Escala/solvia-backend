-- Every existing business had Cobranza: keep it. New businesses start with it by default.
UPDATE "tenants" SET "modules" = array_prepend('collections'::"TenantModule", "modules") WHERE NOT ('collections' = ANY("modules"));
ALTER TABLE "tenants" ALTER COLUMN "modules" SET DEFAULT ARRAY['collections']::"TenantModule"[];
