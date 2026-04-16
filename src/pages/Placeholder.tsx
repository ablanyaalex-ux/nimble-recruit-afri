import { PageContainer, PageHeader } from "@/components/app/PageHeader";

export default function Placeholder({ title, eyebrow }: { title: string; eyebrow?: string }) {
  return (
    <PageContainer>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        description="Coming next. We're building this section as part of the v1 plan."
      />
      <div className="rounded-lg border border-dashed border-border p-10 md:p-16 text-center bg-card">
        <p className="font-display text-xl text-muted-foreground">Nothing here yet.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Foundations are in place — content lands in the next build steps.
        </p>
      </div>
    </PageContainer>
  );
}
