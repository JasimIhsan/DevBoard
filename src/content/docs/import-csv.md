Import many tasks at once from a CSV file, for example from a spreadsheet or another tool.

## How to import

1. Open a project's **Backlog**.
2. Choose **Import CSV**.
3. Click **Copy CSV template** or **Download** to get a starting file.
4. Paste or upload your CSV. DevBoard validates it and shows a preview.
5. Fix any listed errors, then click **Import**.

Nothing is imported until every row is valid.

## Columns

| Column | Required | Values |
| --- | --- | --- |
| `title` | Yes | Text. |
| `description` | No | Markdown text. |
| `type` | No | `FEATURE`, `BUG`, `CHORE`, `SPIKE`. |
| `priority` | No | `P0`, `P1`, `P2`, `P3`. |
| `column` | No | The name of a board column, such as `To Do`. Empty means the backlog. |
| `labels` | No | Comma-separated, in quotes: `"api, security"`. |
| `estimate` | No | A number of points. |
| `due_date` | No | `YYYY-MM-DD`. |

Header names are not case-sensitive, and unknown columns are ignored.

## Example

```csv
title,description,type,priority,column,labels,estimate,due_date
"Add rate limiting","Return 429 with Retry-After",FEATURE,P1,To Do,"api, security",3,2026-11-01
"Fix flaky login test",,BUG,P0,,ci,1,
```

> **Note** A `column` must match one of the project's columns (not case-sensitive); otherwise the import is rejected and nothing is created. Older files with a `status` column still work: `TODO`, `IN_PROGRESS` and `DONE` map to the default columns, and `sprint` is ignored. Archived projects cannot receive imports.
