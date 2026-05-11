import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore - vite ?url import
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, rgb } from "pdf-lib";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Rectangle stored normalised (0-1) against original PDF page width/height.
type Rect = { page: number; x: number; y: number; w: number; h: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  jobCandidateId: string;
  resumePath: string | null;
  initialRects: Rect[];
  onSaved: (info: { redactedPath: string; rects: Rect[]; anonymized: boolean }) => void;
};

const RENDER_SCALE = 1.4;

export function AnonymiseCvDialog({
  open,
  onOpenChange,
  candidateId,
  jobCandidateId,
  resumePath,
  initialRects,
  onSaved,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const [rects, setRects] = useState<Rect[]>(initialRects ?? []);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState<
    | { page: number; startX: number; startY: number; curX: number; curY: number }
    | null
  >(null);

  // Load and render PDF when opened
  useEffect(() => {
    if (!open || !resumePath) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setRects(initialRects ?? []);
      try {
        const { data: signed, error } = await supabase.storage
          .from("resumes")
          .createSignedUrl(resumePath, 600);
        if (error || !signed?.signedUrl) throw error ?? new Error("Failed to load CV");
        const res = await fetch(signed.signedUrl);
        const buf = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        setPdfBytes(buf);

        const loadingTask = pdfjsLib.getDocument({ data: buf.slice(0) });
        const pdf = await loadingTask.promise;
        const sizes: { w: number; h: number }[] = [];
        // Render after canvases mount
        setTimeout(async () => {
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: RENDER_SCALE });
            const canvas = document.getElementById(`anon-pdf-page-${i}`) as HTMLCanvasElement | null;
            if (!canvas) continue;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            const orig = page.getViewport({ scale: 1 });
            sizes[i - 1] = { w: orig.width, h: orig.height };
          }
          if (!cancelled) setPageSizes([...sizes]);
        }, 0);
        // pre-set length so canvases mount
        setPageSizes(new Array(pdf.numPages).fill({ w: 0, h: 0 }));
      } catch (e: any) {
        toast.error(e?.message ?? "Could not load CV");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resumePath]);

  const onMouseDown = (e: React.MouseEvent, pageIdx: number) => {
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDrawing({ page: pageIdx, startX: x, startY: y, curX: x, curY: y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drawing) return;
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    setDrawing({
      ...drawing,
      curX: e.clientX - rect.left,
      curY: e.clientY - rect.top,
    });
  };

  const onMouseUp = (pageIdx: number, displayWidth: number, displayHeight: number) => {
    if (!drawing || drawing.page !== pageIdx) return setDrawing(null);
    const x1 = Math.min(drawing.startX, drawing.curX);
    const y1 = Math.min(drawing.startY, drawing.curY);
    const x2 = Math.max(drawing.startX, drawing.curX);
    const y2 = Math.max(drawing.startY, drawing.curY);
    const w = x2 - x1;
    const h = y2 - y1;
    setDrawing(null);
    if (w < 4 || h < 4) return;
    setRects((prev) => [
      ...prev,
      {
        page: pageIdx,
        x: x1 / displayWidth,
        y: y1 / displayHeight,
        w: w / displayWidth,
        h: h / displayHeight,
      },
    ]);
  };

  const removeRect = (idx: number) => setRects((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    if (!pdfBytes || !resumePath) return;
    setSaving(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      for (const r of rects) {
        const page = pages[r.page];
        if (!page) continue;
        const { width, height } = page.getSize();
        const x = r.x * width;
        const w = r.w * width;
        const h = r.h * height;
        // pdf-lib uses bottom-left origin
        const yTop = r.y * height;
        const yBottom = height - yTop - h;
        page.drawRectangle({ x, y: yBottom, width: w, height: h, color: rgb(0, 0, 0), opacity: 1 });
      }
      const out = await pdfDoc.save();
      // Storage RLS requires path to start with the workspace_id folder.
      // Reuse the workspace folder from the original resume path.
      const workspaceFolder = resumePath.split("/")[0];
      const redactedPath = `${workspaceFolder}/${candidateId}/redacted.pdf`;
      const { error: upErr } = await supabase.storage
        .from("resumes")
        .upload(redactedPath, new Blob([out as unknown as ArrayBuffer], { type: "application/pdf" }), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (upErr) throw upErr;

      const { error: dbErr } = await supabase
        .from("candidates")
        .update({ redacted_resume_path: redactedPath, redaction_rects: rects as any })
        .eq("id", candidateId);
      if (dbErr) throw dbErr;

      const { error: jcErr } = await supabase
        .from("job_candidates")
        .update({ anonymized: true } as any)
        .eq("id", jobCandidateId);
      if (jcErr) throw jcErr;

      toast.success("CV anonymised.");
      onSaved({ redactedPath, rects, anonymized: true });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save redactions");
    } finally {
      setSaving(false);
    }
  };

  const removeAnonymisation = async () => {
    setSaving(true);
    try {
      await supabase
        .from("candidates")
        .update({ redacted_resume_path: null, redaction_rects: [] as any })
        .eq("id", candidateId);
      await supabase
        .from("job_candidates")
        .update({ anonymized: false } as any)
        .eq("id", jobCandidateId);
      toast.success("Anonymisation removed.");
      onSaved({ redactedPath: "", rects: [], anonymized: false });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove anonymisation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Anonymise candidate</DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground -mt-2">
          Header details (name, email, phone, LinkedIn, location) are hidden automatically.
          On the CV below, click and drag to draw a black box over any identifier you want to redact.
        </div>

        <div ref={containerRef} className="overflow-auto flex-1 border rounded-md bg-muted/30 p-4 space-y-6">
          {!resumePath && <p className="text-sm text-muted-foreground">No CV uploaded for this candidate.</p>}
          {resumePath && loading && pageSizes.length === 0 && (
            <p className="text-sm text-muted-foreground">Loading CV…</p>
          )}
          {pageSizes.map((_, idx) => {
            const pageRects = rects
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => r.page === idx);
            return (
              <div key={idx} className="relative inline-block mx-auto">
                <canvas id={`anon-pdf-page-${idx + 1}`} className="block shadow border bg-white" />
                <div
                  className="absolute inset-0 cursor-crosshair"
                  onMouseDown={(e) => onMouseDown(e, idx)}
                  onMouseMove={onMouseMove}
                  onMouseUp={(e) => {
                    const target = e.currentTarget as HTMLDivElement;
                    onMouseUp(idx, target.clientWidth, target.clientHeight);
                  }}
                  onMouseLeave={() => setDrawing(null)}
                >
                  {pageRects.map(({ r, i }) => (
                    <div
                      key={i}
                      className="absolute bg-black/85 group"
                      style={{
                        left: `${r.x * 100}%`,
                        top: `${r.y * 100}%`,
                        width: `${r.w * 100}%`,
                        height: `${r.h * 100}%`,
                      }}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRect(i);
                        }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                        title="Remove"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {drawing?.page === idx && (
                    <div
                      className="absolute bg-black/40 border border-black"
                      style={{
                        left: Math.min(drawing.startX, drawing.curX),
                        top: Math.min(drawing.startY, drawing.curY),
                        width: Math.abs(drawing.curX - drawing.startX),
                        height: Math.abs(drawing.curY - drawing.startY),
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={removeAnonymisation}
            disabled={saving}
            className="text-destructive hover:text-destructive"
          >
            <ShieldOff className="h-3.5 w-3.5" /> Remove anonymisation
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setRects([])} disabled={saving || rects.length === 0}>
              Clear boxes
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || !pdfBytes}>
              {saving ? "Saving…" : "Save & anonymise"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
