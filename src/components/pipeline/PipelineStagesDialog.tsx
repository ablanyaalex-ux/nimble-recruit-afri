import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Trash2, GripVertical, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_STAGES, type PipelineStage } from "@/lib/permissions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  stages: PipelineStage[];
  onChanged: () => void;
};

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);

export function PipelineStagesDialog({ open, onOpenChange, workspaceId, stages, onChanged }: Props) {
  const [items, setItems] = useState<PipelineStage[]>(stages);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setItems(stages);
  }, [open, stages]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next.map((s, idx) => ({ ...s, position: idx + 1 })));
  };

  const removeAt = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const addStage = () => {
    const label = newLabel.trim();
    if (!label) return;
    let key = slug(label);
    if (!key) key = `stage_${Date.now()}`;
    if (items.some((s) => s.key === key)) {
      toast.error("Stage with similar name already exists.");
      return;
    }
    setItems([...items, { key, label, position: items.length + 1 }]);
    setNewLabel("");
  };

  const resetDefaults = () => setItems(DEFAULT_STAGES.map((s) => ({ ...s })));

  const save = async () => {
    setSaving(true);
    try {
      const existingKeys = new Set(stages.map((s) => s.key));
      const nextKeys = new Set(items.map((s) => s.key));
      const toDelete = [...existingKeys].filter((k) => !nextKeys.has(k));

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from("workspace_pipeline_stages" as any)
          .delete()
          .eq("workspace_id", workspaceId)
          .in("key", toDelete);
        if (error) throw error;
      }

      const upserts = items.map((s, idx) => ({
        workspace_id: workspaceId,
        key: s.key,
        label: s.label,
        position: idx + 1,
      }));
      const { error: upErr } = await supabase
        .from("workspace_pipeline_stages" as any)
        .upsert(upserts, { onConflict: "workspace_id,key" });
      if (upErr) throw upErr;

      toast.success("Pipeline stages updated.");
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customise pipeline stages</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {items.map((s, i) => (
            <Card key={s.key} className="p-2 flex items-center gap-2">
              <div className="flex flex-col">
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => move(i, -1)}>▲</button>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => move(i, 1)}>▼</button>
              </div>
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <Input
                value={s.label}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...s, label: e.target.value };
                  setItems(next);
                }}
                className="h-8"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeAt(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </Card>
          ))}
        </div>

        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs">Add new stage</Label>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Technical Test"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStage())}
            />
            <Button onClick={addStage} size="sm"><Plus className="h-4 w-4" /></Button>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={resetDefaults}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </Button>
          <Button onClick={save} disabled={saving || items.length === 0}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
