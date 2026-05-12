import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, CalendarCheck2, Clock } from "lucide-react";
import { toast } from "sonner";

type Info = {
  ok: boolean;
  status: string;
  scheduled_at: string | null;
  duration_minutes: number;
  job_title: string;
  company_name: string;
  candidate_name: string;
  slots: string[];
};

export default function SchedulePublic() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("interview-scheduling", {
      body: { mode: "info", token },
    });
    if (error) toast.error(error.message);
    setInfo(data as Info);
    setLoading(false);
  }
  useEffect(() => { load(); }, [token]);

  const grouped = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of info?.slots ?? []) {
      const d = new Date(s);
      const key = d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return Array.from(m.entries());
  }, [info?.slots]);

  async function book(slot: string) {
    setBooking(slot);
    const { data, error } = await supabase.functions.invoke("interview-scheduling", {
      body: { mode: "book", token, slot },
    });
    setBooking(null);
    if (error || !data?.ok) { toast.error(error?.message ?? "Could not book"); return; }
    toast.success("Interview confirmed");
    await load();
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (!info?.ok) return <div className="min-h-screen grid place-items-center text-muted-foreground">Invalid scheduling link.</div>;

  if (info.status === "scheduled") {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <CalendarCheck2 className="h-12 w-12 mx-auto text-primary" />
          <h1 className="font-display text-2xl">You're booked</h1>
          <p className="text-sm text-muted-foreground">
            Your interview for <strong>{info.job_title}</strong> is scheduled for{" "}
            <strong>{new Date(info.scheduled_at!).toLocaleString()}</strong>. A calendar invite has been sent to your email.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{info.company_name}</p>
          <h1 className="font-display text-3xl">Schedule your interview</h1>
          <p className="text-muted-foreground mt-1">
            {info.job_title} • {info.duration_minutes} minutes
          </p>
        </div>

        {grouped.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            No availability in the next two weeks. The recruiter has been notified.
          </Card>
        ) : (
          <div className="space-y-6">
            {grouped.map(([day, slots]) => (
              <div key={day}>
                <h2 className="text-sm font-medium mb-2">{day}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {slots.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      disabled={booking !== null}
                      onClick={() => book(s)}
                      className="justify-center"
                    >
                      {booking === s ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <><Clock className="h-3.5 w-3.5 mr-1.5" />{new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
