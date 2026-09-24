-- Optional modules a business asked for on the landing form.
ALTER TABLE "access_requests" ADD COLUMN     "modules" "TenantModule"[] DEFAULT ARRAY[]::"TenantModule"[];
