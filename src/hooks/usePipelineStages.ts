import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_STAGES, type PipelineStage } from "@/lib/permissions";

export function usePipelineStages(workspaceId: string | null | undefined) {
  const [stages, setStages] = useState<PipelineStage[]>(DEFAULT_STAGES);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!workspaceId) {
      setStages(DEFAULT_STAGES);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("workspace_pipeline_stages" as any)
      .select("key, label, position")
      .eq("workspace_id", workspaceId)
      .order("position");
    if (data && data.length > 0) {
      setStages(data as unknown as PipelineStage[]);
    } else {
      setStages(DEFAULT_STAGES);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return { stages, loading, refresh };
}
