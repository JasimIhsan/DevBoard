import { CentralBoard } from "@/components/board/central-board";
import { getAllBoards } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata = { title: "All projects" };

export default async function CentralBoardPage() {
  return <CentralBoard initialData={await getAllBoards()} />;
}
