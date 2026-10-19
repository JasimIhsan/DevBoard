import { z } from "zod";

export const statusEnum = z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]);
export const priorityEnum = z.enum(["P0", "P1", "P2", "P3"]);
export const typeEnum = z.enum(["FEATURE", "BUG", "CHORE", "SPIKE"]);

// Labels are stored lower-case and de-duplicated, whatever the caller sends (UI, API or CSV import),
// because search and the label filter match the lower-case form.
const labels = z
  .array(z.string().trim().min(1).max(24))
  .max(8)
  .transform((ls) => [...new Set(ls.map((l) => l.toLowerCase()))]);
const optionalUrl = z.string().trim().url().or(z.literal("")).nullable().optional();

export const createTaskSchema = z.object({
  projectKey: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().max(20000).optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  type: typeEnum.optional(),
  sprintId: z.string().uuid().nullable().optional(),
  branchName: z.string().trim().max(200).nullable().optional(),
  labels: labels.optional(),
  estimate: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20000).optional(),
  priority: priorityEnum.optional(),
  type: typeEnum.optional(),
  status: statusEnum.optional(),
  sprintId: z.string().uuid().nullable().optional(),
  branchName: z.string().trim().max(200).nullable().optional(),
  prUrl: optionalUrl,
  labels: labels.optional(),
  estimate: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const reorderSchema = z.object({
  newStatus: statusEnum,
  prevTaskId: z.string().nullable().optional(),
  nextTaskId: z.string().nullable().optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, "2–10 chars, letters/numbers, start with a letter"),
  description: z.string().trim().max(300).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  archived: z.boolean().optional(),
  starred: z.boolean().optional(),
});

const recentKinds = z.enum(["board", "backlog", "central", "task"]);
export const recentPutSchema = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      kind: recentKinds,
      projectKey: z.string().max(20).optional(),
      taskKey: z.string().max(40).optional(),
      title: z.string().max(200).optional(),
      taskType: typeEnum.optional(),
      ts: z.number().int().positive(),
    }),
  )
  .max(60);

export const createSprintSchema = z.object({
  name: z.string().trim().min(1).max(80),
  goal: z.string().trim().max(300).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const sprintActionSchema = z.object({
  sprintId: z.string().uuid(),
  action: z.enum(["start", "complete", "update", "delete"]),
  // For "complete": where unfinished tasks go. null = backlog.
  moveUnfinishedTo: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  goal: z.string().trim().max(300).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export const subtaskSchema = z.object({ title: z.string().trim().min(1).max(200) });
export const subtaskPatchSchema = z.object({
  id: z.string().uuid(),
  done: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
});
export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000) });

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const importTasksSchema = z.object({
  projectKey: z.string().trim().min(1),
  tasks: z
    .array(
      createTaskSchema.omit({ projectKey: true, sprintId: true }).extend({
        /** Sprint name. Matched case-insensitively against existing sprints; otherwise a draft sprint is created. */
        sprint: z.string().trim().max(80).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type ImportTasksInput = z.infer<typeof importTasksSchema>;

export const createTodoSchema = z.object({
  title: z.string().trim().min(1, "Write something to do").max(200),
  dueDate: z.string().datetime().nullable().optional(),
});
export const updateTodoSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});
