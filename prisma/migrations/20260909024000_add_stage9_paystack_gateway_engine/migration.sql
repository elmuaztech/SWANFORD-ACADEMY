-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'FAILED_RETRYABLE', 'FAILED_FATAL');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'SETTLED', 'HELD', 'DISPUTED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('UNRECONCILED', 'RECONCILED', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "PaymentTargetType" AS ENUM ('APPLICATION_FEE', 'INVOICE');

-- AlterEnum
ALTER TYPE "GatewayTransactionStatus" ADD VALUE 'ONGOING';
ALTER TYPE "GatewayTransactionStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "GatewayTransactionStatus" ADD VALUE 'QUEUED';
ALTER TYPE "GatewayTransactionStatus" ADD VALUE 'REVERSED';

-- DropIndex
DROP INDEX IF EXISTS "payment_webhook_events_gateway_provider_event_id_key";

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "authorization_code" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "customer_email" TEXT,
ADD COLUMN     "ip_address" TEXT,
ADD COLUMN     "net_amount_kobo" BIGINT,
ADD COLUMN     "reconciliation_status" "ReconciliationStatus" NOT NULL DEFAULT 'UNRECONCILED',
ADD COLUMN     "settled_at" TIMESTAMP(3),
ADD COLUMN     "settlement_batch_id" UUID,
ADD COLUMN     "settlement_status" "SettlementStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "payment_webhook_events" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_attempt_at" TIMESTAMP(3),
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "locked_by" TEXT,
ADD COLUMN     "max_attempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "next_retry_at" TIMESTAMP(3),
ADD COLUMN     "payload_hash" TEXT,
ADD COLUMN     "processing_log" JSONB,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "status" "WebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
ALTER COLUMN "event_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "payment_sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "target_type" "PaymentTargetType" NOT NULL,
    "application_id" UUID,
    "invoice_id" UUID,
    "payer_email" TEXT NOT NULL,
    "expected_amount_kobo" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paystack_settlements" (
    "id" UUID NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "gross_amount_kobo" BIGINT NOT NULL,
    "total_fees_kobo" BIGINT NOT NULL,
    "net_amount_kobo" BIGINT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "settled_at" TIMESTAMP(3) NOT NULL,
    "bank_name" TEXT,
    "bank_account_number" TEXT,
    "raw_response_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paystack_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_sessions_token_hash_key" ON "payment_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "payment_sessions_token_hash_idx" ON "payment_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "payment_sessions_application_id_idx" ON "payment_sessions"("application_id");

-- CreateIndex
CREATE INDEX "payment_sessions_invoice_id_idx" ON "payment_sessions"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "paystack_settlements_settlement_id_key" ON "paystack_settlements"("settlement_id");

-- CreateIndex
CREATE INDEX "payment_transactions_application_id_idx" ON "payment_transactions"("application_id");

-- CreateIndex
CREATE INDEX "payment_transactions_invoice_id_idx" ON "payment_transactions"("invoice_id");

-- CreateIndex
CREATE INDEX "payment_transactions_settlement_status_idx" ON "payment_transactions"("settlement_status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_webhook_events_payload_hash_key" ON "payment_webhook_events"("payload_hash");

-- CreateIndex
CREATE INDEX "payment_webhook_events_status_next_retry_at_idx" ON "payment_webhook_events"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "payment_webhook_events_reference_idx" ON "payment_webhook_events"("reference");

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_settlement_batch_id_fkey" FOREIGN KEY ("settlement_batch_id") REFERENCES "paystack_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PostgreSQL Check constraint for PaymentSession mutual exclusivity (Mandatory Item 4)
ALTER TABLE "payment_sessions" ADD CONSTRAINT "check_payment_session_target_integrity"
CHECK (
  (target_type = 'APPLICATION_FEE' AND application_id IS NOT NULL AND invoice_id IS NULL) OR
  (target_type = 'INVOICE' AND invoice_id IS NOT NULL AND application_id IS NULL)
);
