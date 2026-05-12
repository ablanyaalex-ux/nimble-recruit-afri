import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Competency = { key: string; label: string };

export function JobCompetenciesDialog({
  open, onOpenChange, jobId,
}: { open: boolean; onOpenChange: (v: boolean) => void; jobId: string | null }) {
  const [items, setItems] = useState<Competency[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    supabase.from("jobs").select("interview_competencies").eq("id", jobId).maybeSingle()
      .then(({ data }) => setItems((data?.interview_competencies as Competency[]) ?? []));
  }, [open, jobId]);

  function add() {
    setItems([...items, { key: `c_${items.length + 1}`, label: "" }]);
  }

  async function save() {
    if (!jobId) return;
    setSaving(true);
    const clean = items.filter((i) => i.label.trim()).map((i) => ({
      key: i.key || i.label.toLowerCase().replace(/\s+/g, "_"),
      label: i.label.trim(),
    }));
    const { error } = await supabase.from("jobs").update({ interview_competencies: clean }).eq("id", jobId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Competencies saved");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scorecard competencies</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No competencies. Defaults will be used.</p>}
          {items.map((c, i) => (
            <div key={i} className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Label</Label>
                <Input value={c.label} onChange={(e) => {
                  const v = [...items]; v[i].label = e.target.value; setItems(v);
                }} placeholder="e.g. Technical depth" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
