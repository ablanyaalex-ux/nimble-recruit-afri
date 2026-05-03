import { useEffect, useMemo, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { mentionName, type MentionableUser } from "@/lib/mentions";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  users: MentionableUser[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
};

export function MentionTextarea({ value, onChange, users, placeholder, rows = 3, disabled, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [triggerIdx, setTriggerIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const candidates = useMemo(() => users.filter((u) => mentionName(u)), [users]);
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const list = q
      ? candidates.filter((u) =>
          [mentionName(u), u.role_label, u.subtitle].some((v) => v?.toLowerCase().includes(q)),
        )
      : candidates;
    return list.slice(0, 8);
  }, [candidates, query]);

  useEffect(() => setActiveIdx(0), [query, open]);

  const detectTrigger = (text: string, caret: number) => {
    // Look back from caret for @ that starts a word
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        const prev = i === 0 ? " " : text[i - 1];
        if (/\s/.test(prev) || i === 0) {
          const after = text.slice(i + 1, caret);
          // stop if mention contains newline
          if (/\n/.test(after)) return null;
          return { idx: i, query: after };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);
    const caret = e.target.selectionStart ?? text.length;
    const t = detectTrigger(text, caret);
    if (t) {
      setOpen(true);
      setTriggerIdx(t.idx);
      setQuery(t.query);
    } else {
      setOpen(false);
      setTriggerIdx(null);
      setQuery("");
    }
  };

  const insertMention = (u: MentionableUser) => {
    if (triggerIdx === null || !ref.current) return;
    const name = mentionName(u);
    const el = ref.current;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, triggerIdx);
    const after = value.slice(caret);
    const insertion = `@${name} `;
    const next = before + insertion + after;
    onChange(next);
    setOpen(false);
    setTriggerIdx(null);
    setQuery("");
    requestAnimationFrame(() => {
      const pos = (before + insertion).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={className}
      />
      {open && filtered.length > 0 && (
        <div className={cn(
          "absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md",
        )}>
          {filtered.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(u); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
                i === activeIdx ? "bg-accent" : "hover:bg-accent",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <UserRound className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{mentionName(u)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[u.role_label, u.subtitle].filter(Boolean).join(" • ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
