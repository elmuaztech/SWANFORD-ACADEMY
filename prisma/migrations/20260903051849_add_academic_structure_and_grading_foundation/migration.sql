-- CreateEnum
CREATE TYPE "AcademicSessionStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AcademicTermStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "academic_sessions" ADD COLUMN     "status" "AcademicSessionStatus" NOT NULL DEFAULT 'UPCOMING';

-- AlterTable
ALTER TABLE "academic_terms" ADD COLUMN     "status" "AcademicTermStatus" NOT NULL DEFAULT 'UPCOMING';

-- AlterTable
ALTER TABLE "programmes" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "school_classes" ADD COLUMN     "display_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "description" TEXT,
ADD COLUMN     "display_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" UUID NOT NULL,
    "programme_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pass_mark" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_bands" (
    "id" UUID NOT NULL,
    "grading_scale_id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "min_score" DECIMAL(5,2) NOT NULL,
    "max_score" DECIMAL(5,2) NOT NULL,
    "points" DECIMAL(4,2),
    "remark" TEXT NOT NULL,
    "is_pass" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_bands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_code_key" ON "grading_scales"("code");

-- CreateIndex
CREATE INDEX "grading_scales_programme_id_idx" ON "grading_scales"("programme_id");

-- CreateIndex
CREATE INDEX "grading_bands_grading_scale_id_min_score_max_score_idx" ON "grading_bands"("grading_scale_id", "min_score", "max_score");

-- CreateIndex
CREATE UNIQUE INDEX "grading_bands_grading_scale_id_grade_key" ON "grading_bands"("grading_scale_id", "grade");

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_bands" ADD CONSTRAINT "grading_bands_grading_scale_id_fkey" FOREIGN KEY ("grading_scale_id") REFERENCES "grading_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
