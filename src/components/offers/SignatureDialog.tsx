import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PenTool, Type, Eraser } from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultName: string;
  onSign: (payload: { type: "typed" | "drawn"; data: string; signerName: string }) => Promise<void> | void;
  submitting?: boolean;
};

export function SignatureDialog({ open, onOpenChange, defaultName, onSign, submitting }: Props) {
  const [tab, setTab] = useState<"type" | "draw">("type");
  const [name, setName] = useState(defaultName);
  const [typed, setTyped] = useState(defaultName);
  const [consent, setConsent] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (open) {
      setName(defaultName);
      setTyped(defaultName);
      setConsent(false);
      setHasDrawn(false);
      setTimeout(() => clearCanvas(), 0);
    }
  }, [open, defaultName]);

  const getCtx = () => {
    const c = canvasRef.current;
    if (!c) return null;
    // Scale for crisp lines
    const ratio = window.devicePixelRatio || 1;
    if (c.width !== c.clientWidth * ratio) {
      c.width = c.clientWidth * ratio;
      c.height = c.clientHeight * ratio;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e1523";
    ctx.lineWidth = 2.4;
    return ctx;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = getCtx();
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };
  const end = () => { drawing.current = false; };

  const submit = async () => {
    if (!consent) return;
    if (!name.trim()) return;
    if (tab === "type") {
      const value = typed.trim() || name.trim();
      if (!value) return;
      await onSign({ type: "typed", data: value, signerName: name.trim() });
    } else {
      const c = canvasRef.current;
      if (!c || !hasDrawn) return;
      const data = c.toDataURL("image/png");
      await onSign({ type: "drawn", data, signerName: name.trim() });
    }
  };

  const canSubmit = consent && !!name.trim() && (tab === "type" ? typed.trim().length > 0 : hasDrawn) && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Sign & accept offer</DialogTitle>
          <DialogDescription>
            Your electronic signature is legally binding. Adopt a signature by typing your name or drawing it below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Full legal name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "type" | "draw")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="type"><Type className="h-3.5 w-3.5" /> Type</TabsTrigger>
              <TabsTrigger value="draw"><PenTool className="h-3.5 w-3.5" /> Draw</TabsTrigger>
            </TabsList>
            <TabsContent value="type">
              <div className="rounded-lg border bg-muted/30 p-4">
                <Input value={typed} onChange={(e) => setTyped(e.target.value)}
                  className="border-0 bg-transparent text-3xl italic font-serif h-auto py-3 focus-visible:ring-0"
                  placeholder="Your signature" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Rendered in a formal cursive on the signed document.</p>
            </TabsContent>
            <TabsContent value="draw">
              <div className="rounded-lg border bg-muted/30 p-2">
                <canvas
                  ref={canvasRef}
                  className="w-full h-40 bg-white rounded touch-none cursor-crosshair"
                  onPointerDown={start}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onPointerLeave={end}
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-[11px] text-muted-foreground">Draw with mouse or finger.</p>
                  <Button size="sm" variant="ghost" onClick={clearCanvas} type="button">
                    <Eraser className="h-3.5 w-3.5" /> Clear
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} className="mt-0.5" />
            <span className="text-muted-foreground leading-snug">
              I agree to use electronic records and signatures, and I intend for this signature to bind me
              to the terms of the offer.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? "Signing…" : "Adopt & sign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
