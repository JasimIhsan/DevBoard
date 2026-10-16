"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Database, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client";
import type { SetupStatus } from "@/lib/setup";

type Phase = "url" | "unmigrated" | "waiting" | "done";

/**
 * Shown instead of the app while there is no usable database. A non-dismissable dialog walks through
 * entering DATABASE_URL (saved to the project's .env) and applying the Prisma migrations.
 */
export function SetupGate({ status }: { status: SetupStatus }) {
  const { db, env } = status;
  const [phase, setPhase] = useState<Phase>(db.state === "unmigrated" ? "unmigrated" : "url");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(db.state === "unreachable" ? db.message ?? null : null);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Once a URL is saved, wait for the server to see a working, migrated database, then reload into the app.
  const waitForDatabase = (onUnmigrated: () => void) => {
    setPhase("waiting");
    const started = Date.now();
    const tick = async () => {
      try {
        const s = await api<SetupStatus>("/api/setup/status");
        if (s.db.state === "ok") return window.location.reload();
        if (s.db.state === "unmigrated") return onUnmigrated();
      } catch { /* server restarting after the .env change: keep polling */ }
      if (Date.now() - started > 30_000) return setStale(true);
      pollRef.current = window.setTimeout(tick, 1000);
    };
    void tick();
  };
  useEffect(() => () => { if (pollRef.current) window.clearTimeout(pollRef.current); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ ok: true; migrated: boolean }>("/api/setup/env", { method: "POST", json: { DATABASE_URL: url.trim() } });
      toast.success("Connected. Saved DATABASE_URL to .env");
      if (r.migrated) waitForDatabase(() => setPhase("unmigrated"));
      else setPhase("unmigrated");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const migrate = async () => {
    setBusy(true);
    setError(null);
    try {
      // Plain fetch rather than api(): on failure the body carries the CLI output, which is the useful part.
      const res = await fetch("/api/setup/migrate", { method: "POST", cache: "no-store" });
      const r = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; output?: string };
      setOutput(r.output ?? null);
      if (!res.ok) throw new Error(r.error ?? `Request failed (${res.status})`);
      toast.success("Migrations applied");
      waitForDatabase(() => setError("Migrations ran but the tables are still missing. Check the output below."));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-dvh place-items-center bg-background">
      <Dialog open>
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Database className="size-4" /> Connect a database</DialogTitle>
            <DialogDescription>
              {db.state === "missing" && "DevBoard stores everything in PostgreSQL, and no DATABASE_URL is configured yet."}
              {db.state === "unreachable" && <>DATABASE_URL is set to <code className="font-mono text-xs">{db.display}</code>, but DevBoard can&apos;t connect to it.</>}
              {db.state === "unmigrated" && <>Connected to <code className="font-mono text-xs">{db.display}</code>, but it has no tables yet.</>}
            </DialogDescription>
          </DialogHeader>

          {!env.writable ? (
            <ManualInstructions file={env.file} />
          ) : phase === "url" ? (
            <form className="grid gap-4" onSubmit={save}>
              <div className="grid gap-1.5">
                <Label htmlFor="database-url" className="text-xs text-muted-foreground">Connection string</Label>
                <Input id="database-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="postgresql://user:password@localhost:5432/devboard" className="font-mono" spellCheck={false} autoComplete="off" />
                <p className="text-xs text-muted-foreground">
                  Saved as <code className="font-mono">DATABASE_URL</code> in <code className="font-mono">.env</code> in the project folder. The connection is tested first.
                  No database yet? Run <code className="font-mono">createdb devboard</code>.
                </p>
              </div>
              {error && <ErrorNote>{error}</ErrorNote>}
              <DialogFooter>
                <Button type="submit" disabled={busy || !url.trim()}>{busy && <Loader2 className="animate-spin" />}Test & save</Button>
              </DialogFooter>
            </form>
          ) : phase === "unmigrated" ? (
            <div className="grid gap-4">
              <p className="text-sm">DevBoard can create its tables now by applying the bundled migrations. This is the same as running:</p>
              <CommandLine>npx prisma migrate deploy</CommandLine>
              {error && <ErrorNote>{error}</ErrorNote>}
              {output && <pre className="scroll-thin max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">{output}</pre>}
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="ghost" onClick={() => { setPhase("url"); setError(null); }}>Change URL</Button>
                <Button type="button" onClick={migrate} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Apply migrations</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="grid gap-4">
              {stale ? (
                <>
                  <ErrorNote>Saved, but the app hasn&apos;t picked the change up yet. Restart DevBoard (<code className="font-mono">npm run dev</code>) and reload this page.</ErrorNote>
                  <DialogFooter><Button type="button" onClick={() => window.location.reload()}>Reload</Button></DialogFooter>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Database ready. Loading DevBoard…</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManualInstructions({ file }: { file: string }) {
  return (
    <div className="grid gap-3 text-sm">
      <p>This deployment can&apos;t write its <code className="font-mono">.env</code> file, so set the variable where the app is hosted (or in <code className="font-mono text-xs">{file}</code>) and restart:</p>
      <CommandLine>DATABASE_URL=&quot;postgresql://user:password@host:5432/devboard&quot;</CommandLine>
      <p>Then apply the migrations:</p>
      <CommandLine>npx prisma migrate deploy</CommandLine>
      <DialogFooter><Button type="button" onClick={() => window.location.reload()}>Reload</Button></DialogFooter>
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><span className="break-words">{children}</span></p>;
}

/** A one-line command with a copy button. */
export function CommandLine({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };
  return (
    <div className="flex w-full min-w-0 items-center gap-1 rounded-md border bg-muted/40 pl-2.5 pr-1">
      <code className="min-w-0 flex-1 truncate py-1.5 font-mono text-xs">{children}</code>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Copy" onClick={copy}>{copied ? <Check /> : <Copy />}</Button>
    </div>
  );
}
