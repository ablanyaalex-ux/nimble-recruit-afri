import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { PageContainer, PageHeader } from "@/components/app/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  const { user } = useAuth();
  const { memberships, currentWorkspaceId } = useWorkspace();
  const ws = memberships.find((m) => m.workspace_id === currentWorkspaceId);
  const greeting = (user?.user_metadata?.display_name as string) || user?.email?.split("@")[0] || "there";

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Today"
        title={`Good to see you, ${greeting}.`}
        description={`You're signed in to ${ws?.workspaces.name ?? "your workspace"}. Your role: ${ws?.role ?? "member"}.`}
      />

      <div className="grid gap-4 md:gap-6 md:grid-cols-3">
        <Card className="border-border/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base font-medium text-muted-foreground">
              Open jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-display text-4xl">0</div>
            <p className="text-sm text-muted-foreground mt-1">Create your first job from the Jobs tab.</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base font-medium text-muted-foreground">
              Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-display text-4xl">0</div>
            <p className="text-sm text-muted-foreground mt-1">Upload a CV to add your first candidate.</p>
          </CardContent>
        </Card>

        <Card className="border-border/80 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base font-medium text-muted-foreground">
              Upcoming interviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-display text-4xl">0</div>
            <p className="text-sm text-muted-foreground mt-1">Schedule once you have candidates in pipeline.</p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
