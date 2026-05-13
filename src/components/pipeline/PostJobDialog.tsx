import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Megaphone, Linkedin, MessageCircle, Globe, Store, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Job = {
  id: string;
  title: string;
  location: string | null;
  description: string | null;
  workspace_id: string;
  clients: { name: string } | null;
};

const AFRICAN_BOARDS = [
  { name: "Jobberman (Nigeria)", url: "https://www.jobberman.com/employer/post-job" },
  { name: "BrighterMonday (Kenya/Uganda)", url: "https://www.brightermonday.co.ke/employer/post-job" },
  { name: "MyJobMag (Pan-African)", url: "https://www.myjobmag.com/post-a-job" },
  { name: "Pnet (South Africa)", url: "https://www.pnet.co.za/recruiter" },
  { name: "Fuzu (East Africa)", url: "https://www.fuzu.com/employers" },
  { name: "Glassdoor", url: "https://www.glassdoor.com/employers/post-job/" },
];

const CATEGORIES = ["Engineering", "Product", "Design", "Sales", "Marketing", "Operations", "Finance", "People", "Other"];

export function PostJobDialog({ job, trigger }: { job: Job; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const careersUrl = `${window.location.origin}/careers/${job.workspace_id}/${job.id}`;
  const marketplaceUrl = `${window.location.origin}/jobs`;
  const company = job.clients?.name ?? "Our client";
  const summary = `${job.title}${job.location ? ` — ${job.location}` : ""} at ${company}\n\n${
    job.description ? job.description.slice(0, 400) + (job.description.length > 400 ? "…" : "") : ""
  }\n\nApply: ${careersUrl}`;

  const copy = async (text: string, label = "Copied") => {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(careersUrl)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(summary)}`;

  // Marketplace state
  const [mpStatus, setMpStatus] = useState<"public" | "private">("private");
  const [mpCategory, setMpCategory] = useState<string>("Engineering");
  const [mpSummary, setMpSummary] = useState<string>("");
  const [mpSaving, setMpSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("jobs")
        .select("marketplace_status, marketplace_category, marketplace_summary")
        .eq("id", job.id)
        .maybeSingle();
      if (data) {
        setMpStatus((data.marketplace_status as "public" | "private") ?? "private");
        setMpCategory(data.marketplace_category ?? "Engineering");
        setMpSummary(data.marketplace_summary ?? "");
      }
    })();
  }, [open, job.id]);

  async function saveMarketplace(nextStatus?: "public" | "private") {
    setMpSaving(true);
    const status = nextStatus ?? mpStatus;
    const { error } = await supabase
      .from("jobs")
      .update({
        marketplace_status: status,
        marketplace_category: mpCategory,
        marketplace_summary: mpSummary.trim() || null,
        marketplace_published_at: status === "public" ? new Date().toISOString() : null,
      })
      .eq("id", job.id);
    setMpSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMpStatus(status);
    toast.success(status === "public" ? "Published to marketplace" : "Removed from marketplace");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Megaphone className="h-5 w-5" /> Post job
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="marketplace">
          <TabsList className="grid grid-cols-5">
            <TabsTrigger value="marketplace"><Store className="h-3 w-3" /> Marketplace</TabsTrigger>
            <TabsTrigger value="careers"><Globe className="h-3 w-3" /> Careers</TabsTrigger>
            <TabsTrigger value="linkedin"><Linkedin className="h-3 w-3" /> LinkedIn</TabsTrigger>
            <TabsTrigger value="whatsapp"><MessageCircle className="h-3 w-3" /> WhatsApp</TabsTrigger>
            <TabsTrigger value="boards">Boards</TabsTrigger>
          </TabsList>

          <TabsContent value="marketplace" className="space-y-4 mt-4">
            <div className="flex items-start justify-between gap-3 p-3 border rounded-md">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Talentboard Marketplace</span>
                  <Badge variant={mpStatus === "public" ? "default" : "secondary"} className="text-[10px] capitalize">
                    {mpStatus}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Publish to the public job board. Anyone can browse and apply.
                </p>
              </div>
              <Switch
                checked={mpStatus === "public"}
                onCheckedChange={(v) => saveMarketplace(v ? "public" : "private")}
                disabled={mpSaving}
              />
            </div>

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={mpCategory} onValueChange={setMpCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">One-line summary (shown on the marketplace card)</Label>
                <Textarea
                  rows={2}
                  maxLength={160}
                  value={mpSummary}
                  onChange={(e) => setMpSummary(e.target.value)}
                  placeholder="e.g. Lead our backend platform team — fully remote, generous equity."
                />
                <p className="text-[11px] text-muted-foreground mt-1">{mpSummary.length}/160</p>
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveMarketplace()} disabled={mpSaving}>
                  {mpSaving && <Loader2 className="h-3 w-3 animate-spin" />} Save
                </Button>
              </div>
            </div>

            {mpStatus === "public" && (
              <div className="text-xs text-muted-foreground border-t pt-3">
                View at <a href={marketplaceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{marketplaceUrl}</a>
              </div>
            )}
          </TabsContent>

          <TabsContent value="careers" className="space-y-3 mt-4">
            <Label className="text-xs">Public careers link</Label>
            <div className="flex gap-2">
              <Input readOnly value={careersUrl} />
              <Button onClick={() => copy(careersUrl, "Link copied")} size="sm" variant="outline">
                <Copy className="h-3 w-3" /> Copy
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={careersUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> Open</a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Share this link anywhere. It shows the job description and a way for candidates to apply.</p>
          </TabsContent>

          <TabsContent value="linkedin" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">Share to your LinkedIn feed or send to a contact.</p>
            <Button asChild>
              <a href={linkedinUrl} target="_blank" rel="noreferrer">
                <Linkedin className="h-4 w-4" /> Open LinkedIn share
              </a>
            </Button>
            <Card className="p-3 text-xs whitespace-pre-wrap">{summary}</Card>
            <Button size="sm" variant="outline" onClick={() => copy(summary, "Caption copied")}>
              <Copy className="h-3 w-3" /> Copy caption
            </Button>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">Share to a WhatsApp channel, group, or contact.</p>
            <Textarea rows={6} defaultValue={summary} id="wa-text" />
            <div className="flex gap-2">
              <Button asChild>
                <a href={whatsappUrl} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> Open WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="outline" onClick={() => copy(summary, "Message copied")}>
                <Copy className="h-3 w-3" /> Copy message
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="boards" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">
              Click a board to open its post-a-job page in a new tab. The job description is copied to your clipboard so you can paste it in.
            </p>
            <div className="grid gap-2">
              {AFRICAN_BOARDS.map((b) => (
                <Button
                  key={b.name}
                  variant="outline"
                  className="justify-between"
                  onClick={() => {
                    copy(summary, `JD copied — paste into ${b.name}`);
                    window.open(b.url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <span>{b.name}</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
