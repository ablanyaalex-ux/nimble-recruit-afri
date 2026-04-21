import { useState } from "react";
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
import { Copy, ExternalLink, Megaphone, Linkedin, MessageCircle, Globe } from "lucide-react";
import { toast } from "sonner";

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

export function PostJobDialog({ job, trigger }: { job: Job; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const careersUrl = `${window.location.origin}/careers/${job.workspace_id}/${job.id}`;
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Megaphone className="h-5 w-5" /> Post job
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="careers">
          <TabsList className="grid grid-cols-4">
            <TabsTrigger value="careers"><Globe className="h-3 w-3" /> Careers</TabsTrigger>
            <TabsTrigger value="linkedin"><Linkedin className="h-3 w-3" /> LinkedIn</TabsTrigger>
            <TabsTrigger value="whatsapp"><MessageCircle className="h-3 w-3" /> WhatsApp</TabsTrigger>
            <TabsTrigger value="boards">Boards</TabsTrigger>
          </TabsList>

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
