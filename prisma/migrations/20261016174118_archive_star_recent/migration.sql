-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "starredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RecentItem" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "projectKey" TEXT,
    "taskKey" TEXT,
    "title" TEXT,
    "taskType" "TaskType",
    "visitedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecentItem_visitedAt_idx" ON "RecentItem"("visitedAt");
