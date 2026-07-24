import { useMemo } from "react";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Render `text` with every occurrence of any term in `terms` wrapped in <mark>.
 * Case-insensitive, terms are OR-ed together, preserves original casing.
 */
export function HighlightedText({
  text,
  terms,
  className,
}: {
  text: string | null | undefined;
  terms: string[];
  className?: string;
}) {
  const safe = text ?? "";
  const cleaned = useMemo(
    () => Array.from(new Set(terms.map((t) => t.trim()).filter((t) => t.length > 0))),
    [terms],
  );

  const parts = useMemo(() => {
    if (cleaned.length === 0 || !safe) return [{ text: safe, hit: false }];
    const pattern = new RegExp(`(${cleaned.map(escapeRegExp).join("|")})`, "gi");
    const chunks: { text: string; hit: boolean }[] = [];
    let last = 0;
    for (const m of safe.matchAll(pattern)) {
      const start = m.index ?? 0;
      if (start > last) chunks.push({ text: safe.slice(last, start), hit: false });
      chunks.push({ text: m[0], hit: true });
      last = start + m[0].length;
    }
    if (last < safe.length) chunks.push({ text: safe.slice(last), hit: false });
    return chunks;
  }, [safe, cleaned]);

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </span>
  );
}
