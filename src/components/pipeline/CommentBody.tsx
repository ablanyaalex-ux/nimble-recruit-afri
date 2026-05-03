import { useMemo } from "react";
import { mentionName, type MentionableUser } from "@/lib/mentions";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function CommentBody({ text, users }: { text: string; users: MentionableUser[] }) {
  const parts = useMemo(() => {
    const names = users
      .map((u) => mentionName(u))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (names.length === 0) return [{ t: "text", v: text }] as Array<{ t: string; v: string }>;
    const re = new RegExp(`(^|\\s)@(${names.map(escapeRegex).join("|")})(?=$|\\s|[.,!?;:)])`, "gi");
    const out: Array<{ t: "text" | "mention"; v: string }> = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const matchStart = m.index + m[1].length;
      if (matchStart > last) out.push({ t: "text", v: text.slice(last, matchStart) });
      out.push({ t: "mention", v: `@${m[2]}` });
      last = matchStart + 1 + m[2].length;
    }
    if (last < text.length) out.push({ t: "text", v: text.slice(last) });
    return out;
  }, [text, users]);

  return (
    <div className="text-sm whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.t === "mention" ? (
          <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">{p.v}</span>
        ) : (
          <span key={i}>{p.v}</span>
        ),
      )}
    </div>
  );
}
