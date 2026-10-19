DevBoard can send **push notifications** to your phone or computer, even when the app is closed. They remind you about work that needs attention so nothing slips.

## What you'll be notified about

| Notification | When it is sent |
| --- | --- |
| **Due today** | Each morning, for tasks and to-dos due today. |
| **Still pending today** | Late afternoon, if those are still open. |
| **Overdue** | Each day, while tasks or to-dos are past their due date. |
| **Urgent** | Each day, while any **P0** task or **High** priority to-do is open. |
| **Sprint ending** | When an active sprint ends tomorrow, today, or is already past its end date. |
| **Quiet project** | When a project has open tasks but no activity for 3 days (then at most every 3 days). |

Each notification is sent once, so you never get the same reminder twice. Nothing is sent overnight (before 7:00 or after 21:00 your time). Tapping a notification opens the right page.

> **Note** "Today" and the quiet hours follow the time zone of the device that turned notifications on.

## Turn them on

1. Open the **Notifications** dialog: the bell in the top bar, **Notifications** in the sidebar, or `⌘K` and search "notifications".
2. Choose **Turn on notifications** and allow them when your browser asks.
3. Choose **Send a test**. A notification should appear within a few seconds.

Do this on every device you want reminders on. Use **Turn off** in the same dialog to stop them on that device.

### iPhone and iPad

Apple only allows web notifications for **installed** apps (iOS 16.4 or later). First add DevBoard to your Home Screen (see [Install as an app](/docs/install-app)), open it from there, then turn notifications on.

### If it doesn't work

| You see | What to do |
| --- | --- |
| "Notifications are blocked" | Allow notifications for this site in your browser settings, then reload. |
| "The background service worker isn't running" | Service workers are off in `npm run dev`. Use the deployed or production build in a normal browser. |
| "The server has no push keys" | Add the VAPID keys below and redeploy. |

## Set up the server

Push needs a one-time setup by whoever hosts DevBoard.

1. **Generate keys** (already done for you locally in `.env`):

   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Set these environment variables** where DevBoard runs (for Vercel: *Project → Settings → Environment Variables*), then redeploy:

   | Variable | Purpose |
   | --- | --- |
   | `VAPID_PUBLIC_KEY` | Public key shared with browsers. |
   | `VAPID_PRIVATE_KEY` | Private key. Keep it secret. |
   | `VAPID_SUBJECT` | A `https:` or `mailto:` contact URL for the push services. |
   | `CRON_SECRET` | Protects the reminder endpoint. |
   | `NOTIFY_STALE_DAYS` | Optional. Days of inactivity before a project is flagged (default 3). |

3. **Schedule the reminders.** DevBoard checks what is due when `/api/cron/notify` is called. On Vercel, `vercel.json` already schedules it twice a day (09:00 and 18:00 India time, written in UTC). Change the times there to suit you. Any scheduler can call it instead:

   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/notify
   ```

> **Tip** Add `?dry=1` to preview what would be sent without sending anything, or `?force=1` to send ignoring quiet hours and history. Both need the `CRON_SECRET`.

Reminders are safe to run as often as you like: what was already sent is remembered.
