import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Search, Loader2, User } from "lucide-react";
import { Input } from "@/components/ui/input";

type Hit = {
  id: string;
  full_name: string;
  email: string | null;
  headline: string | null;
  job_candidate_id?: string | null;
  job_id?: string | null;
};

export function GlobalSearch() {
  const { currentWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!q.trim() || !currentWorkspaceId) {
      setHits([]); return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const term = q.trim();
      const like = `%${term}%`;
      const { data } = await supabase
        .from("candidates")
        .select("id, full_name, email, headline, resume_full_text")
        .eq("workspace_id", currentWorkspaceId)
        .or(`full_name.ilike.${like},email.ilike.${like},headline.ilike.${like},resume_full_text.ilike.${like}`)
        .limit(8);
      const list: Hit[] = (data ?? []).map((c) => ({
        id: c.id, full_name: c.full_name, email: c.email, headline: c.headline,
      }));
      // attach a recent job_candidate for direct navigation
      if (list.length) {
        const ids = list.map((h) => h.id);
        const { data: jcs } = await supabase
          .from("job_candidates")
          .select("id, job_id, candidate_id")
          .in("candidate_id", ids)
          .order("created_at", { ascending: false });
        const byCand = new Map<string, { id: string; job_id: string }>();
        for (const jc of jcs ?? []) {
          if (!byCand.has(jc.candidate_id)) byCand.set(jc.candidate_id, { id: jc.id, job_id: jc.job_id });
        }
        for (const h of list) {
          const m = byCand.get(h.id);
          if (m) { h.job_candidate_id = m.id; h.job_id = m.job_id; }
        }
      }
      setHits(list);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, currentWorkspaceId]);

  const goTo = (h: Hit) => {
    setOpen(false); setQ("");
    if (h.job_candidate_id && h.job_id) {
      navigate(`/app/jobs/${h.job_id}/candidates/${h.job_candidate_id}`);
    } else {
      navigate("/candidates");
    }
  };

  return (
    <div ref={ref} className="relative w-full max-w-md hidden sm:block">
      <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search candidates by name, email, skill…"
        className="pl-9 h-9"
      />
      {open && (q.trim().length > 0) && (
        <div className="absolute mt-1 left-0 right-0 rounded-md border bg-popover shadow-lg z-50 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</div>
          ) : hits.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No candidates found.</div>
          ) : (
            <ul>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => goTo(h)}
                    className="w-full text-left p-3 hover:bg-muted/60 flex items-center gap-3 border-b last:border-0"
                  >
                    <span className="h-8 w-8 rounded-full bg-muted grid place-items-center"><User className="h-4 w-4 text-muted-foreground" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{h.full_name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{h.headline ?? h.email ?? "—"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
