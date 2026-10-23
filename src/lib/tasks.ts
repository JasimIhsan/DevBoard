import type { BoardColumn, ColumnCategory, Prisma, PrismaClient, TaskStatus } from "@prisma/client";
import { db } from "./db";
import { DEFAULT_COLUMNS } from "./constants";
import { ORDER_STEP } from "./ordering";
import { slugBranch } from "./api-utils";
import { taskInclude } from "./serialize";
import type { CreateTaskInput } from "./validators";

type Client = Prisma.TransactionClient | PrismaClient;

/** Bottom-of-column index for a (project, column) lane; `columnId` null is the backlog. */
export async function nextOrderIndex(tx: Client, where: { projectId: string; columnId: string | null }) {
  const last = await tx.task.findFirst({ where, orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
  return (last?.orderIndex ?? 0) + ORDER_STEP;
}

/** The task status that goes with a column (or none: backlog). */
export const statusFor = (column: Pick<BoardColumn, "category"> | null): TaskStatus => (column ? column.category : "BACKLOG");

/** Gives a project its To Do / In Progress / Done columns if it has none yet. Returns the columns in board order. */
export async function ensureDefaultColumns(client: Client, projectId: string): Promise<BoardColumn[]> {
  const existing = await client.boardColumn.findMany({ where: { projectId }, orderBy: { orderIndex: "asc" } });
  if (existing.length > 0) return existing;
  await client.boardColumn.createMany({ data: DEFAULT_COLUMNS.map((c, i) => ({ projectId, name: c.name, category: c.category, orderIndex: (i + 1) * ORDER_STEP })) });
  return client.boardColumn.findMany({ where: { projectId }, orderBy: { orderIndex: "asc" } });
}

/** First column with this category (board order): where "start", "complete" and "move to board" send a task. */
export const firstColumn = (columns: BoardColumn[], category: ColumnCategory) => columns.find((c) => c.category === category) ?? null;

/** Creates a task, minting the next per-project task number atomically. Goes to the backlog unless `columnId` is given. */
export async function createTask(input: CreateTaskInput) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { key: input.projectKey.toUpperCase() },
      data: { nextTaskNumber: { increment: 1 } },
      select: { id: true, key: true, nextTaskNumber: true },
    });
    const taskNumber = project.nextTaskNumber - 1;
    const column = input.columnId ? await tx.boardColumn.findFirst({ where: { id: input.columnId, projectId: project.id } }) : null;
    if (input.columnId && !column) throw new Error("column not found in this project");
    const status = statusFor(column);
    const type = input.type ?? "FEATURE";
    const orderIndex = await nextOrderIndex(tx, { projectId: project.id, columnId: column?.id ?? null });

    return tx.task.create({
      data: {
        projectId: project.id,
        columnId: column?.id ?? null,
        taskNumber,
        title: input.title,
        description: input.description ?? "",
        status,
        priority: input.priority ?? "P2",
        type,
        orderIndex,
        branchName: input.branchName || slugBranch(`${project.key}-${taskNumber}`, input.title, type),
        labels: input.labels ?? [],
        estimate: input.estimate ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        completedAt: status === "DONE" ? new Date() : null,
        activities: { create: { kind: "CREATED", detail: column ? `Task created in ${column.name}` : "Task created in the backlog" } },
      },
      include: taskInclude,
    });
  });
}
