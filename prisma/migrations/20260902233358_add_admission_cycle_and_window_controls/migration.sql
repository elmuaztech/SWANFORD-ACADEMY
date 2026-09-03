/*
  Warnings:

  - The `payment_status` column on the `applications` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `admission_cycle_id` to the `applications` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AdmissionCycleStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProgrammeAvailabilityStatus" AS ENUM ('OPEN', 'CLOSED', 'FULL');

-- CreateEnum
CREATE TYPE "ApplicationPaymentStatus" AS ENUM ('UNPAID', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'WAIVED', 'REFUNDED');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "admission_cycle_id" UUID NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
DROP COLUMN "payment_status",
ADD COLUMN     "payment_status" "ApplicationPaymentStatus" NOT NULL DEFAULT 'UNPAID';

-- CreateTable
CREATE TABLE "admission_cycles" (
    "id" UUID NOT NULL,
    "academic_session_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "AdmissionCycleStatus" NOT NULL DEFAULT 'UPCOMING',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_cycle_programmes" (
    "id" UUID NOT NULL,
    "admission_cycle_id" UUID NOT NULL,
    "programme_id" UUID NOT NULL,
    "status" "ProgrammeAvailabilityStatus" NOT NULL DEFAULT 'OPEN',
    "max_capacity" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admission_cycle_programmes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admission_cycles_code_key" ON "admission_cycles"("code");

-- CreateIndex
CREATE INDEX "admission_cycles_status_idx" ON "admission_cycles"("status");

-- CreateIndex
CREATE INDEX "admission_cycles_academic_session_id_idx" ON "admission_cycles"("academic_session_id");

-- CreateIndex
CREATE INDEX "admission_cycle_programmes_admission_cycle_id_status_idx" ON "admission_cycle_programmes"("admission_cycle_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admission_cycle_programmes_admission_cycle_id_programme_id_key" ON "admission_cycle_programmes"("admission_cycle_id", "programme_id");

-- CreateIndex
CREATE INDEX "applications_admission_cycle_id_status_idx" ON "applications"("admission_cycle_id", "status");

-- AddForeignKey
ALTER TABLE "admission_cycles" ADD CONSTRAINT "admission_cycles_academic_session_id_fkey" FOREIGN KEY ("academic_session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_cycle_programmes" ADD CONSTRAINT "admission_cycle_programmes_admission_cycle_id_fkey" FOREIGN KEY ("admission_cycle_id") REFERENCES "admission_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_cycle_programmes" ADD CONSTRAINT "admission_cycle_programmes_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_admission_cycle_id_fkey" FOREIGN KEY ("admission_cycle_id") REFERENCES "admission_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
