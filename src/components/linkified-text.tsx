import { Fragment } from "react";

/**
 * Renders admin-authored challenge text safely: React escapes all content and
 * only http(s) URLs become links (no HTML, no markdown, no javascript: URLs).
 */
const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

export function LinkifiedText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-fg/90">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap break-words">
          {p.split(URL_RE).map((part, j) =>
            /^https?:\/\//.test(part) ? (
              <a key={j} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline hover:text-fg">
                {part}
              </a>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  );
}
