import type { Prisma, TaskStatus } from "@prisma/client";
import { db } from "./db";
import { ORDER_STEP } from "./ordering";
import { slugBranch } from "./api-utils";
import { taskInclude } from "./serialize";
import type { CreateTaskInput } from "./validators";

/** Bottom-of-column index for a (project, sprint, status) lane. */
export async function nextOrderIndex(
  tx: Prisma.TransactionClient,
  where: { projectId: string; sprintId: string | null; status: TaskStatus },
) {
  const last = await tx.task.findFirst({ where, orderBy: { orderIndex: "desc" }, select: { orderIndex: true } });
  return (last?.orderIndex ?? 0) + ORDER_STEP;
}

/** Creates a task, minting the next per-project task number atomically. */
export async function createTask(input: CreateTaskInput) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.update({
      where: { key: input.projectKey.toUpperCase() },
      data: { nextTaskNumber: { increment: 1 } },
      select: { id: true, key: true, nextTaskNumber: true },
    });
    const taskNumber = project.nextTaskNumber - 1;
    const sprintId = input.sprintId ?? null;
    const sprint = sprintId ? await tx.sprint.findUnique({ where: { id: sprintId }, select: { status: true } }) : null;
    // Only the active sprint's tasks live on the board; everything else waits in BACKLOG.
    const status: TaskStatus = sprint?.status === "ACTIVE" ? (input.status && input.status !== "BACKLOG" ? input.status : "TODO") : "BACKLOG";
    const type = input.type ?? "FEATURE";
    const orderIndex = await nextOrderIndex(tx, { projectId: project.id, sprintId, status });

    const task = await tx.task.create({
      data: {
        projectId: project.id,
        sprintId,
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
        activities: { create: { kind: "CREATED", detail: "Task created" } },
      },
      include: taskInclude,
    });
    return task;
  });
}
