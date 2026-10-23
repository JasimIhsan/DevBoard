A short glossary of the words you will see in DevBoard.

## Project

A container for related work, such as a product or a repository. Every project has a **name**, a permanent **key**, an optional description and a colour.

## Key

A short uppercase code (`CORE`) that identifies a project. Tasks are numbered inside it: `CORE-12` is the 12th task of project `CORE`. Use the key in commit messages, pull requests and conversations.

## Task

A single piece of work. A task has a title, an optional Markdown description, and the fields below.

| Field | Meaning |
| --- | --- |
| **Column** | Where the task is: the **Backlog**, or one of the board's columns. |
| **Priority** | How urgent it is: **P0** Critical, **P1** High, **P2** Medium, **P3** Low. |
| **Type** | What kind of work: **Feature**, **Bug**, **Chore** or **Spike** (a time-boxed investigation). |
| **Estimate** | A size in *points*. Higher means more effort. Points add up per column. |
| **Labels** | Free-form tags such as `api` or `security`. Stored in lowercase. |
| **Due date** | Optional deadline. Overdue tasks are highlighted. |
| **Branch** | A suggested git branch name generated from the task key and title. |

## Backlog

The holding area for tasks that are not on the board yet. Capture ideas here, prioritise them, and move a task to the board when you are ready to start it.

## Board

The Kanban view of a project: columns of cards you drag as work progresses.

## Column

One stage on the board. Every project starts with **To Do**, **In Progress** and **Done**, and can add more (Review, QA, …). Each column has a **type** that says what it means.

## Column type (category)

What a column means, whatever it is called:

| Type | Meaning |
| --- | --- |
| **To do** | Not started. |
| **In progress** | Being worked on. Custom stages like Review usually use this. |
| **Done** | Finished. Gets a completion time and can be archived. |

Dashboards and notifications use the type, so a "QA" column of type *In progress* counts as work in progress.

## Status

A task's state in one word: **Backlog** (not on the board), or the type of the column it is in (**To do**, **In progress**, **Done**).

## Archive

Hiding a **done** task from the board without changing it. Archived tasks stay Done and are listed under the backlog. You can restore them any time.

## Subtask

A checklist item inside a task. Use subtasks for small steps that do not need their own card.

## Archive and star (projects)

- **Star** a project to pin it in the sidebar.
- **Archive** a project when it is finished. It becomes read-only and disappears from the sidebar, dashboard and search, but nothing is lost. You can restore it at any time.
