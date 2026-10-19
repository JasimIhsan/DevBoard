"use client";

import { useState } from "react";
import { Bell, BellOff, CalendarClock, CalendarX, Flame, Flag, Moon, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUi } from "@/components/ui-state";
import { usePwa } from "@/lib/pwa";
import { usePush } from "@/lib/push-client";

const WHAT = [
  { icon: CalendarClock, text: "Tasks and to-dos due today, each morning and again late afternoon if still open" },
  { icon: CalendarX, text: "Anything overdue" },
  { icon: Flame, text: "Urgent work: open P0 tasks and high-priority to-dos" },
  { icon: Flag, text: "A sprint ending tomorrow, today, or already past its end date" },
  { icon: Moon, text: "A project with open tasks but no activity for 3 days" },
];

export function NotificationsDialog() {
  const { notificationsOpen, setNotificationsOpen } = useUi();
  return (
    <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="size-4" />Notifications</DialogTitle>
          <DialogDescription>Get reminders on this device, even when DevBoard is closed.</DialogDescription>
        </DialogHeader>
        {notificationsOpen && <Body />}
      </DialogContent>
    </Dialog>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" /><span>{children}</span></p>;
}

function Body() {
  const { state, enable, disable, sendTest } = usePush();
  const pwa = usePwa();
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);
  const run = (what: "on" | "off" | "test", fn: () => Promise<void>, ok?: string) => async () => {
    setBusy(what);
    try { await fn(); if (ok) toast.success(ok); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };

  const status = (() => {
    switch (state.kind) {
      case "loading": return null;
      case "unsupported":
        return pwa.platform === "ios" && !pwa.installed
          ? <Notice>On iPhone and iPad, notifications only work for the installed app. Add DevBoard to your Home Screen (Share → Add to Home Screen), open it from there, then come back here.</Notice>
          : <Notice>This browser doesn&apos;t support push notifications. Try Chrome, Edge, Firefox or Safari 16.4+.</Notice>;
      case "no-worker": return <Notice>The background service worker isn&apos;t running. It is off in <code>npm run dev</code> and in some embedded browsers. Use the deployed or production build in a regular browser.</Notice>;
      case "no-keys": return <Notice>The server has no push keys yet. Set <code>VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code>, then redeploy.</Notice>;
      case "denied":
        return (
          <Notice>
            <b>Notifications are blocked for this site.</b> Your browser won&apos;t ask again until you allow them.
            <span className="mt-1 block text-muted-foreground">
              {pwa.platform === "android"
                ? "Chrome on Android: tap the lock (or ⓘ) icon next to the address, then Permissions → Notifications → Allow. Or Chrome menu → Settings → Site settings → Notifications → find this site → Allow. Then reload."
                : "Click the lock icon next to the address, set Notifications to Allow, then reload."}
            </span>
          </Notice>
        );
      default: return null;
    }
  })();

  return (
    <div className="space-y-4">
      {status}
      {state.kind === "off" && (
        <Button className="w-full" onClick={run("on", enable, "Notifications are on")} disabled={busy !== null}><Bell />{busy === "on" ? "Turning on…" : "Turn on notifications"}</Button>
      )}
      {state.kind === "on" && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-500"><span className="size-2 rounded-full bg-emerald-500" />Notifications are on for this device</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={run("test", sendTest, "Test sent. It should arrive in a moment.")} disabled={busy !== null}><Send />{busy === "test" ? "Sending…" : "Send a test"}</Button>
            <Button variant="outline" className="flex-1" onClick={run("off", disable, "Notifications are off")} disabled={busy !== null}><BellOff />Turn off</Button>
          </div>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">You&apos;ll be told about</h3>
        <ul className="space-y-2">
          {WHAT.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-2.5 text-sm"><Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />{text}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">Turn it on for each device you use. Reminders arrive twice a day, never overnight.</p>
      </div>
    </div>
  );
}
