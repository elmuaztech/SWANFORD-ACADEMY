-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'ACCOUNT_ACTIVATION');

-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE 'RETRYABLE';

-- AlterTable
ALTER TABLE "guardians" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "residential_address" DROP NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "max_attempts" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "next_retry_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "revoked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_login_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "email_verifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_type" "VerificationTokenType" NOT NULL DEFAULT 'EMAIL_VERIFICATION',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_number_sequences" (
    "year" INTEGER NOT NULL,
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_number_sequences_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "student_import_batches" (
    "id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "created_by_id" UUID,
    "academic_session_id" UUID NOT NULL,
    "total_submitted" INTEGER NOT NULL,
    "total_successful" INTEGER NOT NULL DEFAULT 0,
    "total_failed" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "source_type" TEXT NOT NULL DEFAULT 'MANUAL_BULK_ENTRY',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_import_rows" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "student_id" UUID,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'SUCCESS',
    "raw_data_json" JSONB NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_token_hash_key" ON "email_verifications"("token_hash");

-- CreateIndex
CREATE INDEX "email_verifications_user_id_expires_at_idx" ON "email_verifications"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "email_verifications_token_type_expires_at_idx" ON "email_verifications"("token_type", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_import_batches_batch_number_key" ON "student_import_batches"("batch_number");

-- CreateIndex
CREATE INDEX "student_import_batches_status_idx" ON "student_import_batches"("status");

-- CreateIndex
CREATE INDEX "student_import_batches_academic_session_id_idx" ON "student_import_batches"("academic_session_id");

-- CreateIndex
CREATE INDEX "student_import_rows_batch_id_status_idx" ON "student_import_rows"("batch_id", "status");

-- CreateIndex
CREATE INDEX "student_import_rows_student_id_idx" ON "student_import_rows"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_import_rows_batch_id_row_number_key" ON "student_import_rows"("batch_id", "row_number");

-- AddForeignKey
ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_batches" ADD CONSTRAINT "student_import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_batches" ADD CONSTRAINT "student_import_batches_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_rows" ADD CONSTRAINT "student_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "student_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_import_rows" ADD CONSTRAINT "student_import_rows_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
