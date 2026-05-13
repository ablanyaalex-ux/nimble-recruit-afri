import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  candidateIds: string[];
  onDone?: () => void;
};

export function BulkAddTagDialog({ open, onOpenChange, workspaceId, candidateIds, onDone }: Props) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const t = tag.trim();
    if (!t) return toast.error("Tag is required");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    const rows = candidateIds.map((cid) => ({
      workspace_id: workspaceId,
      candidate_id: cid,
      tag: t,
      created_by: u.user!.id,
    }));
    const { error } = await supabase.from("candidate_tags").upsert(rows, { onConflict: "candidate_id,tag", ignoreDuplicates: true });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Tagged ${candidateIds.length} candidate${candidateIds.length === 1 ? "" : "s"}`);
    setTag("");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="h-4 w-4 text-primary" /> Add tag to {candidateIds.length}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Tag</Label>
          <Input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. talent-pool, react-senior" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Add tag"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
