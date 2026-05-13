import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  jobId: string;
  jobCandidateId: string;
  candidateId: string;
  existingOfferId?: string | null;
  onSaved?: () => void;
};

const CURRENCIES = ["USD", "EUR", "GBP", "NGN", "ZAR", "CAD", "AUD"];

export function OfferDialog({
  open, onOpenChange, workspaceId, jobId, jobCandidateId, candidateId, existingOfferId, onSaved,
}: Props) {
  const { user } = useAuth();
  const [salary, setSalary] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startDate, setStartDate] = useState("");
  const [equity, setEquity] = useState("");
  const [bonus, setBonus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!existingOfferId) {
      setSalary(""); setCurrency("USD"); setStartDate(""); setEquity(""); setBonus(""); setNotes("");
      return;
    }
    (async () => {
      const { data } = await supabase.from("offers").select("*").eq("id", existingOfferId).maybeSingle();
      if (data) {
        setSalary(data.salary_amount?.toString() ?? "");
        setCurrency(data.salary_currency ?? "USD");
        setStartDate(data.start_date ?? "");
        setEquity(data.equity ?? "");
        setBonus(data.bonus ?? "");
        setNotes(data.notes ?? "");
      }
    })();
  }, [open, existingOfferId]);

  const submit = async (status: "draft" | "internal_approval") => {
    if (!user) return;
    if (!salary.trim()) return toast.error("Salary is required.");
    setSaving(true);
    const payload = {
      salary_amount: Number(salary),
      salary_currency: currency,
      start_date: startDate || null,
      equity: equity || null,
      bonus: bonus || null,
      notes: notes || null,
      status,
    };
    if (existingOfferId) {
      const { error } = await supabase.from("offers").update(payload).eq("id", existingOfferId);
      setSaving(false);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("offers").insert({
        ...payload,
        workspace_id: workspaceId,
        job_id: jobId,
        job_candidate_id: jobCandidateId,
        candidate_id: candidateId,
        created_by: user.id,
      } as any);
      setSaving(false);
      if (error) return toast.error(error.message);
    }
    toast.success(status === "draft" ? "Offer saved as draft." : "Submitted for internal approval.");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existingOfferId ? "Edit offer" : "Generate offer"}</DialogTitle>
          <DialogDescription>Capture the offer terms. You can save a draft, then submit for internal approval before sending.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Annual salary</Label>
              <Input type="number" min="0" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="120000" />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Sign-on bonus</Label>
              <Input value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="$10,000" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Equity</Label>
            <Input value={equity} onChange={(e) => setEquity(e.target.value)} placeholder="0.25% over 4 years" />
          </div>
          <div className="space-y-1">
            <Label>Additional notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="PTO, benefits, relocation…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button variant="outline" onClick={() => submit("draft")} disabled={saving}>Save draft</Button>
          <Button onClick={() => submit("internal_approval")} disabled={saving}>Submit for approval</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
