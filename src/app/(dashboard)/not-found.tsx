import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold">Project not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted, or the key is wrong.</p>
        <Button asChild className="mt-4"><Link href="/">Back to dashboard</Link></Button>
      </div>
    </div>
  );
}
