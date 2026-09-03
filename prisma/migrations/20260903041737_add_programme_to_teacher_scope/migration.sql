/*
  Warnings:

  - Added the required column `programme_id` to the `teacher_scopes` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "teacher_scopes_teacher_id_academic_session_id_idx";

-- DropIndex
DROP INDEX "teacher_scopes_teacher_id_academic_session_id_school_class__key";

-- AlterTable
ALTER TABLE "teacher_scopes" ADD COLUMN     "programme_id" UUID NOT NULL,
ALTER COLUMN "school_class_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "teacher_scopes_teacher_id_academic_session_id_programme_id_idx" ON "teacher_scopes"("teacher_id", "academic_session_id", "programme_id");

-- CreateIndex
CREATE INDEX "teacher_scopes_school_class_id_idx" ON "teacher_scopes"("school_class_id");

-- CreateIndex
CREATE INDEX "teacher_scopes_subject_id_idx" ON "teacher_scopes"("subject_id");

-- AddForeignKey
ALTER TABLE "teacher_scopes" ADD CONSTRAINT "teacher_scopes_programme_id_fkey" FOREIGN KEY ("programme_id") REFERENCES "programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
