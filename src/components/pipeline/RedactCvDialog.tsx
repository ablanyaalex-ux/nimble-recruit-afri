import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Eraser, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  /** The full CV text extracted by AI. This is what the recruiter redacts. */
  originalCv: string | null;
  /** The current redacted version that hiring managers see. */
  currentRedacted: string | null;
  onSaved: (next: string | null) => void;
};

const REDACT_TOKEN = "[redacted]";

export function RedactCvDialog({
  open,
  onOpenChange,
  candidateId,
  originalCv,
  currentRedacted,
  onSaved,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(currentRedacted ?? originalCv ?? "");
    }
  }, [open, currentRedacted, originalCv]);

  const redactSelection = () => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) {
      toast.info("Highlight the text you want to redact first.");
      return;
    }
    const next = value.slice(0, start) + REDACT_TOKEN + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + REDACT_TOKEN.length;
      ta.setSelectionRange(caret, caret);
    });
  };

  const resetToOriginal = () => {
    setValue(originalCv ?? "");
  };

  const save = async () => {
    setSaving(true);
    const trimmed = value.trim();
    const { error } = await supabase
      .from("candidates")
      .update({ anonymized_resume_summary: trimmed ? trimmed : null })
      .eq("id", candidateId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Redacted CV saved.");
    onSaved(trimmed || null);
    onOpenChange(false);
  };

  const clearRedaction = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("candidates")
      .update({ anonymized_resume_summary: null })
      .eq("id", candidateId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Custom redaction cleared.");
    onSaved(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Redact CV for hiring managers</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Edit the CV that hiring managers will see. Highlight any text and click <strong>Redact selection</strong> to
            replace it with <code>[redacted]</code>. You can also edit the text freely.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" type="button" onClick={redactSelection} variant="secondary">
              <Eraser className="h-3.5 w-3.5" /> Redact selection
            </Button>
            <Button size="sm" type="button" onClick={resetToOriginal} variant="ghost" disabled={!originalCv}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset to original CV
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">CV shown to hiring managers</Label>
            <Textarea
              ref={taRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={20}
              className="font-mono text-sm leading-relaxed"
              placeholder={originalCv ? "" : "Generate the AI summary first to extract the CV text, then customise what hiring managers see."}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={clearRedaction} disabled={saving || !currentRedacted}>
            Clear custom redaction
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save redacted CV"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
