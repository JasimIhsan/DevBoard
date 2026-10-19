"use client";

import Link from "next/link";
import { Maximize2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useUi } from "@/components/ui-state";
import { useOpenTodoCount } from "@/lib/todos";
import { TodoPanel } from "./todo-panel";

/** Quick to-do drawer, reachable from every page (top bar, floating button on phones, `T`, ⌘K). */
export function TodoSheet() {
  const { todoOpen, setTodoOpen } = useUi();
  const count = useOpenTodoCount();
  return (
    <Sheet open={todoOpen} onOpenChange={setTodoOpen}>
      <SheetContent side="right" className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md" showCloseButton>
        <div className="border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2">
            To-dos
            {count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{count} open</span>}
            <Button asChild variant="ghost" size="icon-xs" className="ml-auto" aria-label="Open full page" title="Open full page">
              <Link href="/todos" onClick={() => setTodoOpen(false)}><Maximize2 /></Link>
            </Button>
          </SheetTitle>
          <SheetDescription className="sr-only">Your personal to-do list. Add, complete, edit and delete to-dos.</SheetDescription>
        </div>
        {todoOpen && <TodoPanel autoFocus className="flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" />}
      </SheetContent>
    </Sheet>
  );
}
