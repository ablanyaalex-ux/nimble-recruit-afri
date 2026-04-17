import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function CreateWorkspace() {
  const { user } = useAuth();
  const { refresh } = useWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("create_workspace", { _name: name.trim() });
      if (error) throw error;

      await refresh();
      toast.success("Workspace created");
      navigate("/", { replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Could not create workspace");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="font-display text-2xl tracking-tight mb-10">TalentFlow</div>
        <h1 className="font-display text-4xl tracking-tight leading-tight">
          Name your workspace.
        </h1>
        <p className="mt-3 text-muted-foreground">
          This is your agency or personal practice. You can invite teammates anytime.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input
              id="ws-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sahara Talent Partners"
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full h-11" disabled={submitting || !name.trim()}>
            {submitting ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </div>
    </div>
  );
}
