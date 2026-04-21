import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

type Contact = { id: string; name: string; title: string | null; email: string | null };

export function HiringManagersCard({
  jobId,
  clientId,
  canEdit,
}: {
  jobId: string;
  clientId: string;
  canEdit: boolean;
}) {
  const [assigned, setAssigned] = useState<Contact[]>([]);
  const [available, setAvailable] = useState<Contact[]>([]);
  const [pick, setPick] = useState("");

  const load = async () => {
    const [aRes, allRes] = await Promise.all([
      supabase
        .from("job_hiring_managers")
        .select("contact_id, client_contacts(id, name, title, email)")
        .eq("job_id", jobId),
      supabase.from("client_contacts").select("id, name, title, email").eq("client_id", clientId).order("name"),
    ]);
    const assignedList = (aRes.data ?? []).map((r: any) => r.client_contacts).filter(Boolean) as Contact[];
    setAssigned(assignedList);
    const ids = new Set(assignedList.map((c) => c.id));
    setAvailable((allRes.data ?? []).filter((c) => !ids.has(c.id)));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, clientId]);

  const add = async () => {
    if (!pick) return;
    const { error } = await supabase.from("job_hiring_managers").insert({ job_id: jobId, contact_id: pick });
    if (error) return toast.error(error.message);
    setPick("");
    load();
  };

  const remove = async (contactId: string) => {
    const { error } = await supabase
      .from("job_hiring_managers")
      .delete()
      .eq("job_id", jobId)
      .eq("contact_id", contactId);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="font-display text-base">Hiring managers</div>
        <Badge variant="outline">{assigned.length}</Badge>
      </div>
      {assigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">None assigned yet.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {assigned.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[c.title, c.email].filter(Boolean).join(" • ") || "—"}
                </div>
              </div>
              {canEdit && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(c.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Add contact…" /></SelectTrigger>
            <SelectContent>
              {available.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No more contacts</div>
              ) : (
                available.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.title ? ` — ${c.title}` : ""}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={add} disabled={!pick}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      )}
    </Card>
  );
}
