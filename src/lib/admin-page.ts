import "server-only";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";

/** Re-verifies admin rights inside each admin page (defence in depth). */
export async function requireAdminPage() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) notFound();
  return viewer;
}
