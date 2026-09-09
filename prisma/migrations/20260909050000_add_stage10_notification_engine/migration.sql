-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SECURITY', 'FINANCE', 'ADMISSION_DECISION', 'ADMISSION_GENERAL', 'ACADEMIC', 'GENERAL');

-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "NotificationStatus" ADD VALUE 'FAILED_PERMANENT';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "category" "NotificationCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "html_body" TEXT,
ADD COLUMN     "idempotency_key" TEXT,
ADD COLUMN     "lease_expires_at" TIMESTAMP(3),
ADD COLUMN     "lease_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "locked_by" TEXT;

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_category_channel_key" ON "notification_preferences"("user_id", "category", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_status_next_retry_at_idx" ON "notifications"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "notifications_category_idx" ON "notifications"("category");

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
