import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Server-rendered pagination links that preserve other query parameters. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params = {},
  pageParam = "page",
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  pageParam?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set(pageParam, String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
      <span className="text-muted">
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("secondary", "sm")} scroll={false}>
            ← Prev
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("secondary", "sm")} scroll={false}>
            Next →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
