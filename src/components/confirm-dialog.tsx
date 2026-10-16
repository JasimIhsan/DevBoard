"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button; focus starts on Cancel so a stray Enter can't delete anything. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
const Ctx = createContext<Confirm | null>(null);

/**
 * In-app replacement for window.confirm(): `if (await confirm({ title: "Delete X?", destructive: true })) …`.
 * Resolves true on confirm, false on Cancel / Escape / clicking outside.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({ title: "" }); // kept after close so the exit animation doesn't go blank
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((options) => {
    resolver.current?.(false); // a newer request supersedes an unanswered one
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(options);
      setOpen(true);
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpen(false);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(v) => !v && settle(false)}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          // Destructive: land on Cancel. Otherwise land on the confirm button so Enter confirms.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const root = (e.currentTarget as HTMLElement | null) ?? document;
            root.querySelector<HTMLElement>(opts.destructive ? "[data-confirm-cancel]" : "[data-confirm-ok]")?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{opts.title}</DialogTitle>
            {opts.description && <DialogDescription>{opts.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button data-confirm-cancel variant="ghost" onClick={() => settle(false)}>{opts.cancelLabel ?? "Cancel"}</Button>
            <Button data-confirm-ok variant={opts.destructive ? "destructive" : "default"} onClick={() => settle(true)}>{opts.confirmLabel ?? "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useConfirm(): Confirm {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return c;
}
