"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";
import { LogoutButton } from "@/components/logout-button";

type NavItem = { href: string; label: string };

/** Desktop links + accessible mobile menu, with active-route highlighting. */
export function NavLinks({
  items,
  signedIn,
  username,
}: {
  items: NavItem[];
  signedIn: boolean;
  username: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const linkCls = (href: string) =>
    cn(
      "rounded-md px-3 py-2 text-sm transition-colors",
      isActive(href) ? "bg-surface-2 text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
    );

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={linkCls(i.href)} aria-current={isActive(i.href) ? "page" : undefined}>
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="hidden items-center gap-2 md:flex">
        {signedIn ? (
          <>
            <span className="max-w-40 truncate font-mono text-sm text-muted" title={username ?? undefined}>
              <span className="text-accent">@</span>
              {username ?? "participant"}
            </span>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className={linkCls("/login")}>
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink hover:bg-accent-strong"
            >
              Register
            </Link>
          </>
        )}
      </div>

      <button
        type="button"
        className="inline-flex size-10 items-center justify-center rounded-lg border border-line text-fg md:hidden"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open ? (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-line bg-surface px-4 pb-4 pt-2 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {items.map((i) => (
              <Link key={i.href} href={i.href} className={linkCls(i.href)}>
                {i.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-line pt-2">
              {signedIn ? (
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-muted">@{username ?? "participant"}</span>
                  <LogoutButton />
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link href="/login" className="flex-1 rounded-lg border border-line-strong px-3 py-2 text-center text-sm">
                    Sign in
                  </Link>
                  <Link href="/register" className="flex-1 rounded-lg bg-accent px-3 py-2 text-center text-sm font-medium text-accent-ink">
                    Register
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
