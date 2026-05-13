import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
};

/**
 * Minimal contentEditable rich-text editor.
 * Stores raw HTML and exposes basic formatting via document.execCommand.
 * execCommand is deprecated but still universally supported and fine for our needs.
 */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 180, disabled }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string>(value);

  // Only sync from props when the external value differs from what we last emitted,
  // to avoid wiping the caret while typing.
  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastValueRef.current) {
      ref.current.innerHTML = value || "";
      lastValueRef.current = value;
    }
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    if (disabled) return;
    document.execCommand(cmd, false, arg);
    // After exec, push current HTML back up.
    if (ref.current) {
      const html = ref.current.innerHTML;
      lastValueRef.current = html;
      onChange(html);
    }
    ref.current?.focus();
  };

  const handleInput = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastValueRef.current = html;
    onChange(html);
  };

  return (
    <div className={`rounded-md border bg-background ${disabled ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-1 border-b p-1">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("bold")} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("italic")} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("insertUnorderedList")} title="Bulleted list">
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => exec("insertOrderedList")} title="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Insert link"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) exec("createLink", url);
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        className="prose prose-sm dark:prose-invert max-w-none p-3 text-sm focus:outline-none"
        style={{ minHeight }}
        data-placeholder={placeholder}
      />
      <style>{`
        [contenteditable=true]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
        [contenteditable=true] ul { list-style: disc; padding-left: 1.25rem; }
        [contenteditable=true] ol { list-style: decimal; padding-left: 1.25rem; }
        [contenteditable=true] a { color: hsl(var(--primary)); text-decoration: underline; }
      `}</style>
    </div>
  );
}

/** Convert plain text (template content as text) to safe HTML preserving newlines. */
export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

/** Strip HTML for plain-text fallback. */
export function htmlToText(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, "");
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || "";
}
