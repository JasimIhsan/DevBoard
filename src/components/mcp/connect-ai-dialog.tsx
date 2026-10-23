"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUi } from "@/components/ui-state";
import { useAppUrl } from "@/lib/app-url";
import { CopyBlock } from "./copy-block";

type Snippet = { title: string; note?: React.ReactNode; code: string };

const json = (v: unknown) => JSON.stringify(v, null, 2);

function snippets(url: string, key: string): Record<string, Snippet[]> {
  const endpoint = `${url}/api/mcp`;
  const bearer = key ? `Bearer ${key}` : "";
  const headers = key ? { headers: { Authorization: bearer } } : {};
  return {
    "claude-code": [
      { title: "Run this in a terminal", note: "Then start a new Claude Code session; the tools load when a session starts.", code: `claude mcp add --transport http devboard ${endpoint}${key ? ` \\\n  --header "Authorization: ${bearer}"` : ""}` },
      { title: "Available in every project (optional)", code: `claude mcp add --scope user --transport http devboard ${endpoint}${key ? ` \\\n  --header "Authorization: ${bearer}"` : ""}` },
    ],
    "claude-desktop": [
      {
        title: "Add to claude_desktop_config.json",
        note: <>Settings → Developer → Edit Config. Needs <a className="underline" href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a>. Restart Claude Desktop afterwards.</>,
        code: json({ mcpServers: { devboard: { command: "npx", args: key ? ["-y", "mcp-remote", endpoint, "--header", "Authorization:${AUTH}"] : ["-y", "mcp-remote", endpoint], ...(key ? { env: { AUTH: bearer } } : {}) } } }),
      },
    ],
    gemini: [{ title: "Add to ~/.gemini/settings.json", note: "Merge into your existing mcpServers if you have one. Run /mcp in Gemini CLI to check.", code: json({ mcpServers: { devboard: { httpUrl: endpoint, ...headers } } }) }],
    cursor: [{ title: "Add to .cursor/mcp.json (or ~/.cursor/mcp.json)", code: json({ mcpServers: { devboard: { url: endpoint, ...headers } } }) }],
    vscode: [{ title: "Add to .vscode/mcp.json", code: json({ servers: { devboard: { type: "http", url: endpoint, ...headers } } }) }],
    other: [
      { title: "Server address (Streamable HTTP)", code: endpoint },
      ...(key ? [{ title: "Authorization header", code: `Authorization: ${bearer}` }] : []),
    ],
  };
}

const TABS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "gemini", label: "Gemini" },
  { id: "cursor", label: "Cursor" },
  { id: "vscode", label: "VS Code" },
  { id: "other", label: "Other" },
];

export function ConnectAiDialog() {
  const { connectAiOpen, setConnectAiOpen } = useUi();
  return (
    <Dialog open={connectAiOpen} onOpenChange={setConnectAiOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PlugZap className="size-4" />Connect an AI assistant</DialogTitle>
          <DialogDescription>Let Claude, Gemini, Cursor and other MCP clients read and manage your tasks. Copy a snippet for your tool; it already points at this server.</DialogDescription>
        </DialogHeader>
        {connectAiOpen && <Body />}
      </DialogContent>
    </Dialog>
  );
}

type Test = { state: "idle" } | { state: "running" } | { state: "ok"; tools: number } | { state: "error"; message: string };

function Body() {
  const { setConnectAiOpen } = useUi();
  const close = () => setConnectAiOpen(false);
  const url = useAppUrl();
  const [key, setKey] = useState("");
  const [test, setTest] = useState<Test>({ state: "idle" });
  const all = snippets(url, key.trim());

  const run = async () => {
    setTest({ state: "running" });
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(key.trim() ? { Authorization: `Bearer ${key.trim()}` } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      if (res.status === 401) return setTest({ state: "error", message: "This server needs an API key. Enter it below and test again." });
      const body = await res.json().catch(() => null);
      const n = body?.result?.tools?.length;
      setTest(res.ok && typeof n === "number" ? { state: "ok", tools: n } : { state: "error", message: body?.error?.message ?? `The server answered ${res.status}.` });
    } catch {
      setTest({ state: "error", message: "Couldn't reach the server." });
    }
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="rounded-lg border p-3">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Server address</p>
        <CopyBlock code={`${url}/api/mcp`} className="mt-2" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={run} disabled={test.state === "running"}>
            {test.state === "running" ? <Loader2 className="animate-spin" /> : <PlugZap />}Test connection
          </Button>
          {test.state === "ok" && <span className="flex items-center gap-1.5 text-sm text-emerald-500"><CheckCircle2 className="size-4" />Working · {test.tools} tools available</span>}
          {test.state === "error" && <span className="flex items-center gap-1.5 text-sm text-destructive"><XCircle className="size-4 shrink-0" />{test.message}</span>}
        </div>
      </div>

      <label className="block text-sm">
        <span className="font-medium">API key</span> <span className="text-muted-foreground">(only if this server has <code className="rounded bg-muted px-1">MCP_API_KEY</code> set)</span>
        <Input value={key} onChange={(e) => { setKey(e.target.value); setTest({ state: "idle" }); }} placeholder="Leave empty if there is no key" type="password" autoComplete="off" spellCheck={false} className="mt-1.5" />
        <span className="mt-1 block text-xs text-muted-foreground">Used only to fill in the snippets below. It isn&apos;t saved or sent anywhere except by Test connection, to this server.</span>
      </label>

      <Tabs defaultValue="claude-code">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:grid-cols-6">
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id} className="text-xs">{t.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-3 space-y-4">
            {all[t.id].map((s) => (
              <div key={s.title} className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium">{s.title}</p>
                {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                <CopyBlock code={s.code} />
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      <p className="text-xs text-muted-foreground">Then try: &ldquo;List my DevBoard projects.&rdquo; More help in <Link className="underline" href="/docs/mcp-setup" onClick={close}>Connect a client</Link> and <Link className="underline" href="/docs/mcp-security" onClick={close}>MCP security</Link>.</p>
    </div>
  );
}
