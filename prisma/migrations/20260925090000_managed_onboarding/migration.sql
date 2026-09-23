-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('pending', 'converted', 'dismissed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "access_requests" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "industry" TEXT,
    "message" TEXT,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'pending',
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_requests_status_createdAt_idx" ON "access_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "access_requests_email_idx" ON "access_requests"("email");

-- AddForeignKey
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

