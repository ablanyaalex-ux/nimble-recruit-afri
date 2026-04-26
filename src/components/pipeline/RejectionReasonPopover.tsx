import { useEffect, useRef, useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const REJECTION_REASONS = [
  "Not enough relevant experience",
  "Missing required skills",
  "Salary expectations too high",
  "Location or work authorization mismatch",
  "Poor communication or responsiveness",
  "Not aligned with role requirements",
  "Withdrew from process",
  "Duplicate application",
  "Position filled",
];

type RejectionReasonPopoverProps = {
  candidateCount?: number;
  children: ReactElement;
  disabled?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  onReasonSelect: (reason: string) => boolean | void | Promise<boolean | void>;
};

export function RejectionReasonPopover({
  candidateCount = 1,
  children,
  disabled = false,
  align = "start",
  side = "bottom",
  onReasonSelect,
}: RejectionReasonPopoverProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleReasonSelect = async (reason: string) => {
    setBusy(true);
    try {
      const result = await onReasonSelect(reason);
      if (mountedRef.current && result !== false) setOpen(false);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-[min(20rem,calc(100vw-2rem))] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3">
          <div className="mb-3">
            <div className="text-sm font-medium">
              Reject {candidateCount > 1 ? `${candidateCount} candidates` : "candidate"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Select a rejection reason.</p>
          </div>
          <div className="grid gap-1.5">
            {REJECTION_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className="min-h-9 rounded-md border border-border bg-background px-3 py-2 text-left text-sm leading-snug transition-colors hover:border-destructive/40 hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                disabled={disabled || busy}
                onClick={() => handleReasonSelect(reason)}
              >
                {reason}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end border-t pt-2">
            <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
