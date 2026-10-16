A short glossary of the words you will see in DevBoard.

## Project

A container for related work, such as a product or a repository. Every project has a **name**, a permanent **key**, an optional description and a colour.

## Key

A short uppercase code (`CORE`) that identifies a project. Tasks are numbered inside it: `CORE-12` is the 12th task of project `CORE`. Use the key in commit messages, pull requests and conversations.

## Task

A single piece of work. A task has a title, an optional Markdown description, and the fields below.

| Field | Meaning |
| --- | --- |
| **Status** | Where the task is in its life: Backlog, To Do, In Progress, In Review or Done. |
| **Priority** | How urgent it is: **P0** Critical, **P1** High, **P2** Medium, **P3** Low. |
| **Type** | What kind of work: **Feature**, **Bug**, **Chore** or **Spike** (a time-boxed investigation). |
| **Estimate** | A size in *points*. Higher means more effort. Points add up per column and per sprint. |
| **Labels** | Free-form tags such as `api` or `security`. Stored in lowercase. |
| **Due date** | Optional deadline. Overdue tasks are highlighted. |
| **Branch** | A suggested git branch name generated from the task key and title. |

## Status

| Status | Meaning |
| --- | --- |
| **Backlog** | Not scheduled. Lives on the backlog page, not on the board. |
| **To Do** | In the active sprint, not started. |
| **In Progress** | Someone is working on it. |
| **In Review** | Work is finished and waiting for review. |
| **Done** | Complete. |

## Backlog

The holding area for work that is not in a sprint. Prioritise it, estimate it, and pull tasks into a sprint when you are ready.

## Sprint

A time-boxed batch of work with a name, an optional goal and dates. A sprint is **Draft** (planned), **Active** (running) or **Completed** (finished). Only one sprint per project can be active.

## Board

The Kanban view of the active sprint with four columns: To Do, In Progress, In Review and Done. Dragging a card changes its status.

## Subtask

A checklist item inside a task. Use subtasks for small steps that do not need their own card.

## Archive and star

- **Star** a project to pin it in the sidebar.
- **Archive** a project when it is finished. It becomes read-only and disappears from the sidebar, dashboard and search, but nothing is lost. You can restore it at any time.
