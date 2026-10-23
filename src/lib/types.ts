import type { ColumnCategory, Priority, TaskStatus, TaskType } from "@prisma/client";

export type { ColumnCategory, Priority, TaskStatus, TaskType };

export interface ProjectDTO {
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string;
  archived: boolean;
  starred: boolean;
  /** ISO time it was starred; sidebar order. */
  starredAt: string | null;
}

/** A board column. Tasks with no column are in the backlog. */
export interface ColumnDTO {
  id: string;
  projectId: string;
  name: string;
  /** What the column means: drives "done" rules (completion time, archiving) and dashboard counts. */
  category: ColumnCategory;
  orderIndex: number;
}

export interface TaskDTO {
  id: string;
  key: string; // e.g. CORE-12
  projectId: string;
  projectKey: string;
  /** Board column, or null while the task is in the backlog. */
  columnId: string | null;
  columnName: string | null;
  taskNumber: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  type: TaskType;
  orderIndex: number;
  branchName: string | null;
  prUrl: string | null;
  labels: string[];
  estimate: number | null;
  dueDate: string | null;
  completedAt: string | null;
  /** Set when a done task has been archived (hidden from the board, listed under the backlog). */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subtasksDone: number;
  subtasksTotal: number;
}

export interface SubtaskDTO {
  id: string;
  title: string;
  done: boolean;
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
}

export interface ActivityDTO {
  id: string;
  kind: string;
  detail: string;
  createdAt: string;
}

export interface TaskDetailDTO extends TaskDTO {
  subtasks: SubtaskDTO[];
  comments: CommentDTO[];
  activities: ActivityDTO[];
}

export interface ProjectBoardDTO {
  project: ProjectDTO;
  columns: ColumnDTO[];
  /** Every task of the project, including archived ones (check `archivedAt`). */
  tasks: TaskDTO[];
}

export type TodoPriority = "LOW" | "MEDIUM" | "HIGH";

export interface TodoDTO {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  dueDate: string | null;
  priority: TodoPriority;
  createdAt: string;
}
