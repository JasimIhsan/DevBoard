"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { useUi } from "@/components/ui-state";
import { CommandLine } from "@/components/setup/setup-gate";
import { api } from "@/lib/client";
import type { SetupStatus } from "@/lib/setup";

/** Endpoint URL and API key for connecting an MCP client. The key is generated here and shown once. */
export function McpAccessDialog() {
  const { mcpOpen, setMcpOpen } = useUi();
  return (
    <Dialog open={mcpOpen} onOpenChange={setMcpOpen}>
      <DialogContent className="sm:max-w-lg">{mcpOpen && <Body />}</DialogContent>
    </Dialog>
  );
}

function Body() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const status = useQuery({ queryKey: ["setup-status"], queryFn: () => api<SetupStatus>("/api/setup/status"), staleTime: 0 });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState("http://localhost:3000/api/mcp");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setEndpoint(`${window.location.origin}/api/mcp`), []);

  const configured = status.data?.mcp.configured ?? false;
  const writable = status.data?.env.writable ?? true;

  const generate = async () => {
    if (configured && !(await confirm({ title: "Rotate the MCP key?", description: "Every client that uses the current key stops working until you give it the new one.", confirmLabel: "Rotate key", destructive: true }))) return;
    setBusy(true);
    try {
      const r = await api<{ key: string }>("/api/mcp/key", { method: "POST" });
      setKey(r.key);
      await qc.invalidateQueries({ queryKey: ["setup-status"] });
      toast.success("Key saved to .env as MCP_API_KEY");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><KeyRound className="size-4" /> MCP access</DialogTitle>
        <DialogDescription>AI assistants (Claude, Gemini, Cursor, …) manage this board through MCP. Every request must carry the API key.</DialogDescription>
      </DialogHeader>

      <div className="grid min-w-0 gap-1.5">
        <div className="text-xs text-muted-foreground">Endpoint (Streamable HTTP)</div>
        <CommandLine>{endpoint}</CommandLine>
      </div>

      <div className="flex min-w-0 items-center gap-2 rounded-md border p-2.5 text-sm">
        {status.isPending ? (
          <><Loader2 className="size-4 animate-spin text-muted-foreground" /> Checking…</>
        ) : configured ? (
          <><ShieldCheck className="size-4 text-emerald-500" /><span>A key is configured. The endpoint accepts requests that send it.</span></>
        ) : (
          <><ShieldOff className="size-4 text-amber-500" /><span>No key yet. The endpoint refuses every request until one exists.</span></>
        )}
        {writable && (
          <Button type="button" size="sm" variant={configured ? "outline" : "default"} className="ml-auto shrink-0" onClick={generate} disabled={busy || status.isPending}>
            {busy && <Loader2 className="animate-spin" />}{configured ? "Rotate key" : "Generate key"}
          </Button>
        )}
      </div>

      {!writable && (
        <p className="text-sm text-muted-foreground">This deployment can&apos;t write <code className="font-mono">.env</code>. Set <code className="font-mono">MCP_API_KEY</code> in your hosting provider&apos;s environment settings and restart.</p>
      )}

      {key && (
        <div className="grid min-w-0 gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-sm font-medium">Your new key — copy it now, it won&apos;t be shown again</div>
          <CommandLine>{key}</CommandLine>
          <div className="mt-1 text-xs text-muted-foreground">Claude Code:</div>
          <CommandLine>{`claude mcp add --transport http devboard ${endpoint} --header "Authorization: Bearer ${key}"`}</CommandLine>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Clients send it as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>. Setup for each client is in{" "}
        <Link href="/docs/mcp-setup" className="underline underline-offset-2 hover:text-foreground">Connect a client</Link>; the stdio bridge (<code className="font-mono">npm run --silent mcp</code>) needs no key.
      </p>
    </div>
  );
}
