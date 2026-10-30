"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/competition", label: "Competition" },
  { href: "/admin/challenges", label: "Challenges" },
  { href: "/admin/scoring", label: "Scoring" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/reset", label: "Reset" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="-mx-4 mb-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 rounded-xl border border-line bg-surface/70 p-1">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-surface-3 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
                  t.href === "/admin/reset" && !active && "text-danger/80",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
