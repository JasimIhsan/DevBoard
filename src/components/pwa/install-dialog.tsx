"use client";

import { useState } from "react";
import { Download, Laptop, Monitor, Share, Smartphone, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { promptInstall, usePwa, type Platform } from "@/lib/pwa";
import { useUi } from "@/components/ui-state";

const TABS: { id: Exclude<Platform, "other">; label: string; icon: typeof Laptop }[] = [
  { id: "macos", label: "macOS", icon: Laptop },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "android", label: "Android", icon: Smartphone },
  { id: "ios", label: "iOS", icon: Smartphone },
];

const STEPS: Record<Exclude<Platform, "other">, { title: string; steps: React.ReactNode[] }[]> = {
  macos: [
    { title: "Chrome or Edge", steps: ["Click the install icon at the right end of the address bar, or open the browser menu and choose “Install DevBoard”.", "Confirm. DevBoard opens in its own window and appears in your Applications / Dock."] },
    { title: "Safari 17 or later", steps: [<>Choose <b>File → Add to Dock…</b> (or click <Share className="inline size-3.5" /> Share → <b>Add to Dock</b>).</>, "Click Add. DevBoard now lives in your Dock like any other app."] },
  ],
  windows: [
    { title: "Chrome or Edge", steps: ["Click the install icon at the right end of the address bar. In Edge you can also use ⋯ → Apps → Install this site as an app.", "Confirm. DevBoard gets its own window, a Start menu entry and an optional taskbar pin."] },
    { title: "Firefox", steps: ["Firefox on desktop can't install web apps. Open DevBoard in Chrome or Edge to install it."] },
  ],
  android: [
    { title: "Chrome", steps: ["Tap Install below, or open the ⋮ menu and choose “Install app” (some versions say “Add to Home screen”).", "Confirm. DevBoard is added to your home screen and app drawer."] },
    { title: "Samsung Internet", steps: ["Open the menu (≡) → Add page to → Home screen."] },
  ],
  ios: [
    { title: "Safari (iPhone and iPad)", steps: [<>Tap <Share className="inline size-3.5" /> Share in the toolbar.</>, <>Scroll down and tap <b>Add to Home Screen</b>.</>, "Tap Add. DevBoard appears on your home screen and opens full screen."] },
    { title: "Chrome or Edge on iOS", steps: ["On iOS 16.4 or later use the same Share menu → Add to Home Screen. Older versions can only install from Safari."] },
  ],
};

export function InstallDialog() {
  const { installOpen, setInstallOpen } = useUi();
  const pwa = usePwa();
  const [tab, setTab] = useState<string | null>(null);
  const current = (pwa.platform === "other" ? "macos" : pwa.platform) as Exclude<Platform, "other">;
  const active = tab ?? current;

  async function install() {
    const result = await promptInstall();
    if (result === "accepted") { toast.success("DevBoard is installing…"); setInstallOpen(false); }
  }

  return (
    <Dialog open={installOpen} onOpenChange={setInstallOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Install DevBoard</DialogTitle>
          <DialogDescription>Run it as an app: its own window or home-screen icon, launches in one click, no browser tabs.</DialogDescription>
        </DialogHeader>

        {pwa.installed && <p className="rounded-lg border bg-muted/40 p-3 text-sm">DevBoard is already installed on this device.</p>}

        {!pwa.secure && (
          <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>This page isn&apos;t served over HTTPS, so browsers won&apos;t offer installation. Open the app via an <code>https://</code> address (or <code>localhost</code> on a desktop).</span>
          </p>
        )}

        {pwa.canPrompt && (
          <Button size="lg" className="w-full" onClick={install}><Download />Install now</Button>
        )}

        <Tabs value={active} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4">
            {TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="gap-1.5"><Icon className="size-3.5 max-sm:hidden" />{label}</TabsTrigger>
            ))}
          </TabsList>
          {TABS.map(({ id }) => (
            <TabsContent key={id} value={id} className="mt-3 space-y-4">
              {id === current && !pwa.canPrompt && !pwa.installed && pwa.ready && (id === "macos" || id === "windows" || id === "android") && pwa.browser !== "safari" && (
                <p className="text-xs text-muted-foreground">No install button here yet? The browser offers it once the page has loaded for a few seconds, and not at all on an unsecured address.</p>
              )}
              {STEPS[id].map((group) => (
                <div key={group.title}>
                  <h3 className="mb-1.5 text-sm font-medium">{group.title}</h3>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                    {group.steps.map((s, i) => <li key={i}>{s}</li>)}
                  </ol>
                </div>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
