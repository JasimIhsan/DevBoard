import type { Metadata } from "next";
import { TodoPanel } from "@/components/todos/todo-panel";

export const metadata: Metadata = { title: "To-dos" };

export default function TodosPage() {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col px-4 py-6 max-sm:pb-24 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">To-dos</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">A personal checklist for quick things. Not tied to any project or sprint.</p>
      <TodoPanel className="flex-1" />
    </div>
  );
}
