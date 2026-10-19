import type { Priority, SprintStatus, TaskStatus, TaskType } from "@prisma/client";

export type { Priority, SprintStatus, TaskStatus, TaskType };

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

export interface SprintDTO {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: SprintStatus;
  startDate: string | null;
  endDate: string | null;
}

export interface TaskDTO {
  id: string;
  key: string; // e.g. CORE-12
  projectId: string;
  projectKey: string;
  sprintId: string | null;
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
  sprints: SprintDTO[];
  tasks: TaskDTO[];
}

export interface TodoDTO {
  id: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  dueDate: string | null;
  createdAt: string;
}
