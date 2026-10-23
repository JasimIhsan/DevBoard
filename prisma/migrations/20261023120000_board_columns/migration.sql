-- Replaces sprints with per-project board columns and adds task archiving.
--
-- Data conversion (nothing is deleted):
--   * every project gets the default columns To Do, In Progress and Done
--   * projects that have tasks In Review also get an "In Review" column (category IN_PROGRESS), keeping those tasks where they were
--   * tasks are attached to the column that matches their old status; backlog tasks keep no column
--   * done tasks that belonged to a completed sprint are archived (hidden from the board, still Done)
--   * Sprint rows and Task.sprintId stay in the database, unused, so no history is lost

-- CreateEnum
CREATE TYPE "ColumnCategory" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "columnId" TEXT;

-- CreateTable
CREATE TABLE "BoardColumn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ColumnCategory" NOT NULL,
    "orderIndex" DOUBLE PRECISION NOT NULL DEFAULT 1000.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardColumn_projectId_orderIndex_idx" ON "BoardColumn"("projectId", "orderIndex");

-- CreateIndex
CREATE INDEX "Task_projectId_columnId_orderIndex_idx" ON "Task"("projectId", "columnId", "orderIndex");

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "BoardColumn"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Data: default columns for every project
INSERT INTO "BoardColumn" ("id", "projectId", "name", "category", "orderIndex")
SELECT gen_random_uuid()::text, p."id", v."name", v."category"::"ColumnCategory", v."orderIndex"
FROM "Project" p
CROSS JOIN (VALUES ('To Do', 'TODO', 1000.0), ('In Progress', 'IN_PROGRESS', 2000.0), ('Done', 'DONE', 4000.0)) AS v("name", "category", "orderIndex");

-- Data: keep tasks that were In Review in their own column, between In Progress and Done
INSERT INTO "BoardColumn" ("id", "projectId", "name", "category", "orderIndex")
SELECT gen_random_uuid()::text, t."projectId", 'In Review', 'IN_PROGRESS'::"ColumnCategory", 3000.0
FROM "Task" t
WHERE t."status" = 'IN_REVIEW'
GROUP BY t."projectId";

-- Data: attach tasks to the column for their old status (backlog tasks stay without a column)
UPDATE "Task" t SET "columnId" = c."id"
FROM "BoardColumn" c
WHERE c."projectId" = t."projectId"
  AND ((t."status" = 'TODO' AND c."name" = 'To Do')
    OR (t."status" = 'IN_PROGRESS' AND c."name" = 'In Progress')
    OR (t."status" = 'IN_REVIEW' AND c."name" = 'In Review')
    OR (t."status" = 'DONE' AND c."name" = 'Done'));

-- Data: done work from completed sprints is history, so archive it
UPDATE "Task" SET "archivedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" = 'DONE' AND "sprintId" IN (SELECT "id" FROM "Sprint" WHERE "status" = 'COMPLETED');

-- Data: In Review is now a column, not a status
UPDATE "Task" SET "status" = 'IN_PROGRESS' WHERE "status" = 'IN_REVIEW';

-- AlterEnum: drop IN_REVIEW from TaskStatus
BEGIN;
CREATE TYPE "TaskStatus_new" AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE');
ALTER TABLE "public"."Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" TYPE "TaskStatus_new" USING ("status"::text::"TaskStatus_new");
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
DROP TYPE "public"."TaskStatus_old";
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'BACKLOG';
COMMIT;
