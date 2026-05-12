import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Block = { id?: string; day_of_week: number; start_time: string; end_time: string; buffer_minutes: number };

export function InterviewerAvailabilityDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!user || !currentWorkspaceId) return;
    const { data } = await supabase
      .from("interviewer_availability")
      .select("id, day_of_week, start_time, end_time, buffer_minutes")
      .eq("user_id", user.id)
      .eq("workspace_id", currentWorkspaceId)
      .order("day_of_week");
    setBlocks((data ?? []).map((b: any) => ({
      ...b,
      start_time: b.start_time.slice(0, 5),
      end_time: b.end_time.slice(0, 5),
    })));
  }
  useEffect(() => { if (open) load(); }, [open, user?.id, currentWorkspaceId]);

  function add() {
    setBlocks([...blocks, { day_of_week: 1, start_time: "09:00", end_time: "17:00", buffer_minutes: 15 }]);
  }

  async function save() {
    if (!user || !currentWorkspaceId) return;
    setSaving(true);
    // wipe and reinsert (small set)
    await supabase.from("interviewer_availability").delete().eq("user_id", user.id).eq("workspace_id", currentWorkspaceId);
    if (blocks.length) {
      const { error } = await supabase.from("interviewer_availability").insert(
        blocks.map((b) => ({
          user_id: user.id,
          workspace_id: currentWorkspaceId,
          day_of_week: b.day_of_week,
          start_time: b.start_time,
          end_time: b.end_time,
          buffer_minutes: b.buffer_minutes,
        }))
      );
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    setSaving(false);
    toast.success("Availability saved");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>My availability</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {blocks.length === 0 && (
            <p className="text-sm text-muted-foreground">No availability blocks. Add one below.</p>
          )}
          {blocks.map((b, i) => (
            <div key={i} className="flex items-end gap-2 border rounded-md p-3">
              <div className="space-y-1">
                <Label className="text-xs">Day</Label>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={b.day_of_week}
                  onChange={(e) => {
                    const v = [...blocks]; v[i].day_of_week = Number(e.target.value); setBlocks(v);
                  }}
                >
                  {DAYS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input type="time" value={b.start_time} onChange={(e) => {
                  const v = [...blocks]; v[i].start_time = e.target.value; setBlocks(v);
                }} className="w-28" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End</Label>
                <Input type="time" value={b.end_time} onChange={(e) => {
                  const v = [...blocks]; v[i].end_time = e.target.value; setBlocks(v);
                }} className="w-28" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Buffer (min)</Label>
                <Input type="number" min={0} value={b.buffer_minutes} onChange={(e) => {
                  const v = [...blocks]; v[i].buffer_minutes = Number(e.target.value); setBlocks(v);
                }} className="w-20" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add block</Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
