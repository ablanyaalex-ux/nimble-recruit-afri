import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sparkles, Trash2, Plus, MousePointer2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, rgb } from "pdf-lib";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

type Box = {
  id: string;
  page: number; // 1-based
  x: number; y: number; w: number; h: number; // normalized 0..1
  kind?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  workspaceId: string;
  /** Storage path of the original CV PDF in the `resumes` bucket. */
  resumePath: string | null;
  /** Storage path of the existing redacted PDF (if any). */
  redactedResumePath: string | null;
  onSaved: (nextPath: string | null) => void;
};

const KIND_COLOURS: Record<string, string> = {
  name: "bg-rose-500/40 border-rose-600",
  email: "bg-amber-500/40 border-amber-600",
  phone: "bg-orange-500/40 border-orange-600",
  address: "bg-yellow-500/40 border-yellow-600",
  location: "bg-yellow-500/40 border-yellow-600",
  linkedin: "bg-sky-500/40 border-sky-600",
  url: "bg-sky-500/40 border-sky-600",
  photo: "bg-purple-500/40 border-purple-600",
  age: "bg-fuchsia-500/40 border-fuchsia-600",
  dob: "bg-fuchsia-500/40 border-fuchsia-600",
  marital: "bg-pink-500/40 border-pink-600",
  gender: "bg-pink-500/40 border-pink-600",
  nationality: "bg-emerald-500/40 border-emerald-600",
  id: "bg-red-600/40 border-red-700",
  other: "bg-slate-500/40 border-slate-600",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function RedactPdfDialog({ open, onOpenChange, candidateId, workspaceId, resumePath, redactedResumePath, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [renderScale, setRenderScale] = useState(1.4);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [tool, setTool] = useState<"select" | "draw">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});
  const containerRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPdfBytes(null);
      setPageSizes([]);
      setBoxes([]);
      setSelectedId(null);
      setTool("select");
    }
  }, [open]);

  // Load + render PDF when opened
  useEffect(() => {
    if (!open || !resumePath) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: signed, error } = await supabase.storage
          .from("resumes")
          .createSignedUrl(resumePath, 600);
        if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not load resume");

        const resp = await fetch(signed.signedUrl);
        const ab = await resp.arrayBuffer();
        if (cancelled) return;
        const bytes = new Uint8Array(ab);
        setPdfBytes(bytes);

        // Render with pdfjs (give it a fresh copy — pdfjs detaches the buffer)
        const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
        const sizes: { width: number; height: number }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: renderScale });
          sizes.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setPageSizes(sizes);

        // Render after canvases mount
        requestAnimationFrame(async () => {
          for (let i = 1; i <= pdf.numPages; i++) {
            const canvas = canvasRefs.current[i];
            if (!canvas) continue;
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: renderScale });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          }
        });

        // Auto-detect on first open
        await runDetect();
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load PDF");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resumePath]);

  const runDetect = async () => {
    setDetecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("redact-resume-detect", {
        body: { candidateId },
      });
      if (error) {
        const msg = (error as any)?.context?.error || (error as any)?.message || "Auto-detection failed";
        throw new Error(msg);
      }
      const incoming = (data as any)?.boxes ?? [];
      const detected: Box[] = incoming.map((b: any) => ({
        id: uid(),
        page: b.page,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        kind: b.kind,
      }));
      setBoxes(detected);
      toast.success(`Detected ${detected.length} item${detected.length === 1 ? "" : "s"} to redact.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Auto-detection failed");
    } finally {
      setDetecting(false);
    }
  };

  // Drawing state
  const drawState = useRef<{ page: number; startX: number; startY: number; id: string } | null>(null);

  const onPageMouseDown = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    if (tool !== "draw") return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const id = uid();
    drawState.current = { page, startX: x, startY: y, id };
    setBoxes((prev) => [...prev, { id, page, x, y, w: 0, h: 0, kind: "other" }]);
    setSelectedId(id);
  };
  const onPageMouseMove = (e: React.MouseEvent<HTMLDivElement>, page: number) => {
    const ds = drawState.current;
    if (!ds || ds.page !== page) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const nx = Math.min(ds.startX, x);
    const ny = Math.min(ds.startY, y);
    const nw = Math.abs(x - ds.startX);
    const nh = Math.abs(y - ds.startY);
    setBoxes((prev) => prev.map((b) => (b.id === ds.id ? { ...b, x: nx, y: ny, w: nw, h: nh } : b)));
  };
  const onPageMouseUp = () => {
    const ds = drawState.current;
    if (!ds) return;
    drawState.current = null;
    // Discard tiny accidental boxes
    setBoxes((prev) => prev.filter((b) => b.id !== ds.id || (b.w > 0.005 && b.h > 0.005)));
    setTool("select");
  };

  const deleteBox = (id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSave = async () => {
    if (!pdfBytes || !resumePath) return;
    setSaving(true);
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes.slice(0));
      const pages = pdfDoc.getPages();
      for (const b of boxes) {
        const page = pages[b.page - 1];
        if (!page) continue;
        const { width, height } = page.getSize();
        // pdf-lib origin is bottom-left; our normalized coords are top-left.
        const px = b.x * width;
        const py = height - (b.y + b.h) * height;
        const pw = b.w * width;
        const ph = b.h * height;
        page.drawRectangle({ x: px, y: py, width: pw, height: ph, color: rgb(0, 0, 0), opacity: 1 });
      }
      const out = await pdfDoc.save();

      const path = `redacted/${candidateId}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("resumes")
        .upload(path, new Blob([new Uint8Array(out)], { type: "application/pdf" }), {
          upsert: true,
          contentType: "application/pdf",
        });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase
        .from("candidates")
        .update({ redacted_resume_path: path })
        .eq("id", candidateId);
      if (updErr) throw updErr;

      toast.success("Redacted CV saved.");
      onSaved(path);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save redacted CV");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      if (redactedResumePath) {
        await supabase.storage.from("resumes").remove([redactedResumePath]);
      }
      const { error } = await supabase
        .from("candidates")
        .update({ redacted_resume_path: null })
        .eq("id", candidateId);
      if (error) throw error;
      toast.success("Redacted CV cleared.");
      onSaved(null);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to clear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Redact CV for hiring managers</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap border-b pb-3">
          <Button
            type="button" size="sm"
            variant={tool === "select" ? "secondary" : "ghost"}
            onClick={() => setTool("select")}
          >
            <MousePointer2 className="h-3.5 w-3.5" /> Select
          </Button>
          <Button
            type="button" size="sm"
            variant={tool === "draw" ? "secondary" : "ghost"}
            onClick={() => setTool("draw")}
          >
            <Plus className="h-3.5 w-3.5" /> Draw box
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button type="button" size="sm" variant="ghost" onClick={runDetect} disabled={detecting || loading}>
            {detecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Re-run auto-detect
          </Button>
          {selectedId && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => deleteBox(selectedId)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete selected
            </Button>
          )}
          <div className="ml-auto text-xs text-muted-foreground">
            {boxes.length} redaction{boxes.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-muted/30 -mx-6 px-6 py-4 space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading CV…
            </div>
          )}
          {!loading && pageSizes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No PDF preview available.</p>
          )}
          {pageSizes.map((size, idx) => {
            const pageNum = idx + 1;
            const pageBoxes = boxes.filter((b) => b.page === pageNum);
            return (
              <div key={pageNum} className="mx-auto" style={{ width: size.width }}>
                <Label className="text-xs text-muted-foreground block mb-1">Page {pageNum}</Label>
                <div
                  ref={(el) => { containerRefs.current[pageNum] = el; }}
                  className="relative bg-white shadow border rounded-sm select-none"
                  style={{ width: size.width, height: size.height, cursor: tool === "draw" ? "crosshair" : "default" }}
                  onMouseDown={(e) => onPageMouseDown(e, pageNum)}
                  onMouseMove={(e) => onPageMouseMove(e, pageNum)}
                  onMouseUp={onPageMouseUp}
                  onMouseLeave={onPageMouseUp}
                >
                  <canvas
                    ref={(el) => { canvasRefs.current[pageNum] = el; }}
                    style={{ display: "block", width: "100%", height: "100%" }}
                  />
                  {pageBoxes.map((b) => {
                    const colour = KIND_COLOURS[b.kind ?? "other"] ?? KIND_COLOURS.other;
                    const isSel = selectedId === b.id;
                    return (
                      <div
                        key={b.id}
                        onMouseDown={(e) => {
                          if (tool === "draw") return;
                          e.stopPropagation();
                          setSelectedId(b.id);
                        }}
                        className={`absolute border-2 ${colour} ${isSel ? "ring-2 ring-foreground" : ""}`}
                        style={{
                          left: `${b.x * 100}%`,
                          top: `${b.y * 100}%`,
                          width: `${b.w * 100}%`,
                          height: `${b.h * 100}%`,
                          cursor: "pointer",
                        }}
                        title={b.kind ?? "redaction"}
                      >
                        {isSel && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); deleteBox(b.id); }}
                            className="absolute -top-3 -right-3 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-xs shadow"
                            aria-label="Delete redaction"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between border-t pt-3">
          <Button type="button" variant="ghost" onClick={handleClear} disabled={saving || !redactedResumePath}>
            Clear redacted CV
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || loading || !pdfBytes}>
              {saving ? "Saving…" : "Save redacted CV"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
