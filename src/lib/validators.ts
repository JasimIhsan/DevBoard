import { z } from "zod";

export const statusEnum = z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "DONE"]);
export const categoryEnum = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
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
  priority: priorityEnum.optional(),
  type: typeEnum.optional(),
  /** Board column to put the task in. Omit or null for the backlog (the default). */
  columnId: z.string().uuid().nullable().optional(),
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
  /** Move to a board column, or null to send the task back to the backlog. */
  columnId: z.string().uuid().nullable().optional(),
  /** Archive (true) or restore (false). Only done tasks can be archived. */
  archived: z.boolean().optional(),
  branchName: z.string().trim().max(200).nullable().optional(),
  prUrl: optionalUrl,
  labels: labels.optional(),
  estimate: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const reorderSchema = z.object({
  columnId: z.string().uuid(),
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

export const createColumnSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40),
  category: categoryEnum.default("IN_PROGRESS"),
});
export const updateColumnSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40).optional(),
  category: categoryEnum.optional(),
  /** Shift the column one place left or right on the board. */
  direction: z.enum(["left", "right"]).optional(),
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
      createTaskSchema.omit({ projectKey: true, columnId: true }).extend({
        /** Board column name, matched case-insensitively. Empty means the backlog. */
        column: z.string().trim().max(40).optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type ImportTasksInput = z.infer<typeof importTasksSchema>;

export const todoPriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const createTodoSchema = z.object({
  title: z.string().trim().min(1, "Write something to do").max(200),
  dueDate: z.string().datetime().nullable().optional(),
  priority: todoPriorityEnum.optional(),
});
export const updateTodoSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  priority: todoPriorityEnum.optional(),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(200) }),
  timezone: z.string().min(1).max(64).default("UTC"),
});
export const pushUnsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });
