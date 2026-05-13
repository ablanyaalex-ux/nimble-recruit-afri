import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Inbox as InboxIcon, Search, Send, Mail, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type Thread = {
  id: string;
  subject: string;
  channel: string;
  participant_email: string | null;
  participant_name: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  status: string;
  reply_to_token: string;
};

type Message = {
  id: string;
  direction: string;
  sender_name: string | null;
  sender_email: string | null;
  recipient_email: string | null;
  body: string;
  created_at: string;
};

function formatRelative(d: string) {
  const date = new Date(d);
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString();
}

export default function Inbox() {
  const { currentWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(params.get("t"));
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load threads
  useEffect(() => {
    if (!currentWorkspaceId) return;
    (async () => {
      const { data, error } = await supabase
        .from("communication_threads")
        .select("*")
        .eq("workspace_id", currentWorkspaceId)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (error) {
        toast.error(error.message);
        return;
      }
      setThreads((data ?? []) as Thread[]);
      if (!activeId && data && data.length) setActiveId(data[0].id);
    })();
  }, [currentWorkspaceId]);

  // Realtime threads
  useEffect(() => {
    if (!currentWorkspaceId) return;
    const ch = supabase
      .channel(`inbox-${currentWorkspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "communication_threads", filter: `workspace_id=eq.${currentWorkspaceId}` },
        async () => {
          const { data } = await supabase
            .from("communication_threads")
            .select("*")
            .eq("workspace_id", currentWorkspaceId)
            .order("last_message_at", { ascending: false })
            .limit(200);
          setThreads((data ?? []) as Thread[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [currentWorkspaceId]);

  // Load messages for active thread
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setParams((p) => {
      const np = new URLSearchParams(p);
      np.set("t", activeId);
      return np;
    });
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("thread_id", activeId)
        .order("created_at", { ascending: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      setMessages((data ?? []) as Message[]);
      // mark read
      await supabase
        .from("communication_threads")
        .update({ unread_count: 0 })
        .eq("id", activeId);
    })();
    const ch = supabase
      .channel(`thread-${activeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${activeId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (t) =>
        t.subject.toLowerCase().includes(q) ||
        (t.participant_name ?? "").toLowerCase().includes(q) ||
        (t.participant_email ?? "").toLowerCase().includes(q) ||
        (t.last_message_preview ?? "").toLowerCase().includes(q),
    );
  }, [threads, search]);

  const active = threads.find((t) => t.id === activeId) ?? null;

  async function handleSend() {
    if (!active || !reply.trim() || !user || !currentWorkspaceId) return;
    setSending(true);
    const body = reply.trim();
    const { error } = await supabase.from("messages").insert({
      thread_id: active.id,
      workspace_id: currentWorkspaceId,
      direction: "outbound",
      sender_user_id: user.id,
      sender_email: user.email,
      recipient_email: active.participant_email,
      body,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReply("");
    toast.success("Message sent (stub — stored in inbox)");
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="border-b border-border px-4 md:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-5 w-5 text-primary" />
          <h1 className="font-display text-xl">Inbox</h1>
        </div>
        <Button size="sm" onClick={() => setComposeOpen(true)}>
          <Plus className="h-4 w-4" /> New thread
        </Button>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[340px_1fr] min-h-0">
        {/* Thread list */}
        <aside className={cn("border-r border-border flex flex-col min-h-0", activeId && "hidden md:flex")}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search threads..."
                className="pl-8 h-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No conversations yet.
              </div>
            )}
            {filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={cn(
                  "w-full text-left px-3 py-3 border-b border-border hover:bg-accent/40 transition-colors",
                  activeId === t.id && "bg-accent/60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm truncate">
                    {t.participant_name || t.participant_email || "Unknown"}
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{formatRelative(t.last_message_at)}</span>
                </div>
                <div className="text-xs font-medium truncate mt-0.5">{t.subject}</div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{t.last_message_preview ?? "—"}</div>
                {t.unread_count > 0 && (
                  <Badge className="mt-1.5 h-5 px-1.5 text-[10px]">{t.unread_count} new</Badge>
                )}
              </button>
            ))}
          </ScrollArea>
        </aside>

        {/* Conversation */}
        <section className={cn("flex flex-col min-h-0", !activeId && "hidden md:flex")}>
          {active ? (
            <>
              <div className="px-4 md:px-6 py-3 border-b border-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{active.subject}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      with {active.participant_name || active.participant_email || "—"}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] uppercase">{active.channel}</Badge>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground truncate">
                  Reply-to: <code>reply+{active.reply_to_token}@inbox.app</code>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div ref={scrollRef} className="p-4 md:p-6 space-y-4">
                  {messages.map((m) => {
                    const out = m.direction === "outbound";
                    return (
                      <div key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                            out ? "bg-primary text-primary-foreground" : "bg-muted",
                          )}
                        >
                          <div className="text-[10px] opacity-70 mb-0.5">
                            {m.sender_name || m.sender_email || (out ? "You" : "Them")} · {formatRelative(m.created_at)}
                          </div>
                          {m.body}
                        </div>
                      </div>
                    );
                  })}
                  {messages.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-12">No messages yet.</div>
                  )}
                </div>
              </ScrollArea>

              <Separator />
              <div className="p-3 md:p-4 border-t border-border">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write a reply..."
                  rows={3}
                  className="resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] text-muted-foreground">⌘/Ctrl + Enter to send</span>
                  <Button size="sm" onClick={handleSend} disabled={sending || !reply.trim()}>
                    <Send className="h-4 w-4" /> Send
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-sm text-muted-foreground">
              Select a conversation
            </div>
          )}
        </section>
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onCreated={(id) => {
          setActiveId(id);
          setComposeOpen(false);
        }}
      />
    </div>
  );
}

function ComposeDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (threadId: string) => void;
}) {
  const { currentWorkspaceId } = useWorkspace();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!user || !currentWorkspaceId || !email.trim() || !subject.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("communication_threads")
      .insert({
        workspace_id: currentWorkspaceId,
        subject: subject.trim(),
        participant_email: email.trim(),
        participant_name: name.trim() || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create thread");
      setBusy(false);
      return;
    }
    if (body.trim()) {
      await supabase.from("messages").insert({
        thread_id: data.id,
        workspace_id: currentWorkspaceId,
        direction: "outbound",
        sender_user_id: user.id,
        sender_email: user.email,
        recipient_email: email.trim(),
        body: body.trim(),
      });
    }
    setBusy(false);
    setName(""); setEmail(""); setSubject(""); setBody("");
    toast.success("Thread created");
    onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Recipient name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Recipient email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
          </div>
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label>Message</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={busy || !email.trim() || !subject.trim()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
