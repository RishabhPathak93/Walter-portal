import Link from "next/link";
import { NavLinks } from "@/components/nav-links";
import type { Viewer } from "@/lib/auth";

export function SiteHeader({ viewer, competitionName }: { viewer: Viewer | null; competitionName: string }) {
  const items = [
    { href: "/challenges", label: "Challenges" },
    { href: "/leaderboard", label: "Leaderboard" },
    ...(viewer ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(viewer?.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur">
      <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-mono text-sm font-semibold tracking-tight text-fg">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-md border border-accent/40 bg-accent-soft text-accent">
            &gt;_
          </span>
          <span className="truncate">{competitionName}</span>
        </Link>
        <NavLinks items={items} signedIn={Boolean(viewer)} username={viewer?.username ?? null} />
      </div>
    </header>
  );
}
