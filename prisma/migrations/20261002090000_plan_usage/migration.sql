-- Plan usage: automatic WhatsApp messages are counted per month; extra packs add to a month.
-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "automatic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "message_packs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "messages" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_packs_tenantId_month_idx" ON "message_packs"("tenantId", "month");

-- AddForeignKey
ALTER TABLE "message_packs" ADD CONSTRAINT "message_packs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

