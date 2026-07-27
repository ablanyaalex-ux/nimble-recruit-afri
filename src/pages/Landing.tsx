import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileSignature,
  Inbox,
  Search,
  Users,
  Sparkles,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const waitlistSchema = z.object({
  full_name: z.string().trim().min(2, "Please tell us your name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  company: z.string().trim().max(120).optional(),
  role: z.string().trim().max(120).optional(),
  team_size: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(600).optional(),
});

const features = [
  {
    icon: Users,
    title: "Pipelines that read like a story",
    body: "Milestones, stages and a full audit trail — every candidate move is logged automatically.",
  },
  {
    icon: CalendarDays,
    title: "Interviews without the ping-pong",
    body: "Send self-scheduling links, book panels in bulk and chase scorecards in one tap.",
  },
  {
    icon: Search,
    title: "Boolean search across full CVs",
    body: '("React" OR "Vue") AND "TypeScript" NOT "Junior" — searched inside the actual resume text.',
  },
  {
    icon: FileSignature,
    title: "Offers, signed and certified",
    body: "Branded offer PDFs, approval chains and DocuSign-style certificates of completion.",
  },
  {
    icon: Inbox,
    title: "One inbox for every thread",
    body: "Candidate email lives beside the pipeline, threaded and searchable by the whole team.",
  },
  {
    icon: Sparkles,
    title: "AI where it earns its keep",
    body: "Resume parsing, anonymised CVs and interview summaries — quiet help, not gimmicks.",
  },
];

const steps = [
  { n: "01", t: "Join the list", d: "Two minutes, no card, no demo call." },
  { n: "02", t: "We onboard you", d: "We import your live roles and set up your first pipeline with you." },
  { n: "03", t: "You shape v1", d: "Direct line to the team. Your feedback ships in days, not quarters." },
];

export default function Landing() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    company: "",
    role: "",
    team_size: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = waitlistSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("waitlist_signups").insert({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      company: parsed.data.company || null,
      role: parsed.data.role || null,
      team_size: parsed.data.team_size || null,
      notes: parsed.data.notes || null,
    });
    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        setDone(true);
        return;
      }
      toast.error("Something went wrong. Please try again.");
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
          <div className="font-display text-xl tracking-tight">TalentFlow</div>
          <nav className="flex items-center gap-2">
            <Link to="/jobs">
              <Button variant="ghost" size="sm">Browse jobs</Button>
            </Link>
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <a href="#waitlist">
              <Button size="sm">Join the waitlist</Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-mesh-creative" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-32">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                First testers · Cohort 01
              </div>
              <h1 className="mt-6 font-display text-5xl leading-[1.05] tracking-tight md:text-7xl">
                Recruiting,
                <br />
                <span className="italic text-primary">refined</span> for the field.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                TalentFlow is a calm, mobile-first applicant tracking system for solo
                recruiters and small agencies. Pipelines, interviews, offers and inbox —
                one quiet place, built to work on the move.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a href="#waitlist">
                  <Button size="lg" className="rounded-full px-7">
                    Join the waiting list <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </a>
                <a href="#what">
                  <Button size="lg" variant="outline" className="rounded-full px-7">
                    See what's inside
                  </Button>
                </a>
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                Free for the whole beta · Shape the roadmap · No card required
              </p>
            </div>

            {/* Hero card */}
            <div className="relative">
              <div className="rounded-3xl bg-sidebar p-6 text-sidebar-foreground shadow-float md:p-8">
                <div className="text-xs uppercase tracking-[0.2em] text-sidebar-foreground/60">
                  Today · Pipeline
                </div>
                <div className="mt-5 space-y-3">
                  {[
                    { name: "Amara O.", stage: "Panel interview", tone: "bg-primary" },
                    { name: "Thabo M.", stage: "Offer sent", tone: "bg-primary/70" },
                    { name: "Chidi E.", stage: "CV review", tone: "bg-sidebar-foreground/30" },
                    { name: "Naledi K.", stage: "Hired", tone: "bg-primary" },
                  ].map((c) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between rounded-2xl bg-sidebar-accent px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-2 w-2 rounded-full ${c.tone}`} />
                        <span className="text-sm font-medium text-sidebar-accent-foreground">
                          {c.name}
                        </span>
                      </div>
                      <span className="text-xs text-sidebar-foreground/70">{c.stage}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-sidebar-border pt-6">
                  {[
                    ["12", "Open roles"],
                    ["8", "Interviews"],
                    ["3", "Offers out"],
                  ].map(([v, l]) => (
                    <div key={l}>
                      <div className="font-display text-2xl text-sidebar-primary">{v}</div>
                      <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">
                        {l}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="what" className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            What's inside
          </div>
          <h2 className="mt-3 font-display text-3xl tracking-tight md:text-5xl">
            Everything a small team needs. Nothing it doesn't.
          </h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-float"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                <f.icon className="h-5 w-5 text-accent-foreground" />
              </div>
              <h3 className="mt-5 font-display text-xl tracking-tight">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="border-y border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
          <div className="grid gap-10 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n}>
                <div className="font-display text-4xl text-primary">{s.n}</div>
                <h3 className="mt-3 font-display text-xl tracking-tight">{s.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Waitlist */}
      <section id="waitlist" className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Cohort 01 · Limited seats
            </div>
            <h2 className="mt-3 font-display text-3xl tracking-tight md:text-5xl">
              Be one of our first testers.
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
              We're onboarding a small group of recruiters personally. You'll get the full
              product free through the beta, a direct line to the team, and real influence
              over what we build next.
            </p>
            <ul className="mt-8 space-y-3">
              {[
                "Free access for the entire beta period",
                "Hands-on onboarding with your live roles",
                "Weekly builds shaped by your feedback",
                "Founding-tester pricing when we launch",
              ].map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-float md:p-8">
            {done ? (
              <div className="py-10 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                  <CheckCircle2 className="h-7 w-7 text-primary" />
                </div>
                <h3 className="mt-6 font-display text-2xl tracking-tight">You're on the list.</h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  We'll email you when your seat in Cohort 01 opens up. Keep an eye on your inbox.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <h3 className="font-display text-2xl tracking-tight">Join the waiting list</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-name">Full name</Label>
                    <Input
                      id="wl-name"
                      value={form.full_name}
                      maxLength={100}
                      onChange={(e) => set("full_name", e.target.value)}
                      placeholder="Amara Okafor"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-email">Work email</Label>
                    <Input
                      id="wl-email"
                      type="email"
                      value={form.email}
                      maxLength={255}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="you@agency.com"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-company">Company</Label>
                    <Input
                      id="wl-company"
                      value={form.company}
                      maxLength={120}
                      onChange={(e) => set("company", e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-role">Your role</Label>
                    <Input
                      id="wl-role"
                      value={form.role}
                      maxLength={120}
                      onChange={(e) => set("role", e.target.value)}
                      placeholder="Recruiter, founder…"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-size">Team size</Label>
                  <Select value={form.team_size} onValueChange={(v) => set("team_size", v)}>
                    <SelectTrigger id="wl-size">
                      <SelectValue placeholder="Select team size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Just me">Just me</SelectItem>
                      <SelectItem value="2–5">2–5</SelectItem>
                      <SelectItem value="6–20">6–20</SelectItem>
                      <SelectItem value="20+">20+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-notes">What's slowing you down today?</Label>
                  <Textarea
                    id="wl-notes"
                    value={form.notes}
                    maxLength={600}
                    rows={3}
                    onChange={(e) => set("notes", e.target.value)}
                    placeholder="Optional — the messier the better."
                  />
                </div>
                <Button type="submit" size="lg" className="w-full rounded-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding you…
                    </>
                  ) : (
                    <>Request my seat <ArrowRight className="ml-1 h-4 w-4" /></>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  No spam. One email when your seat opens.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground md:flex-row md:px-8">
          <div className="font-display text-base text-foreground">TalentFlow</div>
          <div className="flex items-center gap-6">
            <Link to="/jobs" className="hover:text-foreground">Job marketplace</Link>
            <Link to="/post-job" className="hover:text-foreground">Post a job</Link>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </div>
          <div>© {new Date().getFullYear()} TalentFlow</div>
        </div>
      </footer>
    </div>
  );
}
