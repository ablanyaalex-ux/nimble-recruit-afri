import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl md:text-4xl tracking-tight leading-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-muted-foreground max-w-xl">{description}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="p-5 md:p-10 max-w-6xl mx-auto w-full">{children}</div>;
}
