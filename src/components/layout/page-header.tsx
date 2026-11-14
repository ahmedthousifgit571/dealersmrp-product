import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-[1.75rem]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "info";
}) {
  // Each tone is a liquid colour: a tinted clay tile with a glossy orb.
  const toneClass = {
    default: "tone-orange",
    success: "tone-teal",
    warning: "tone-gold",
    info: "tone-blue",
  }[tone];
  return (
    <div className={cn("clay-tint flex items-center gap-4 rounded-2xl p-4 md:p-5", toneClass)}>
      <span className="orb size-12 shrink-0 rounded-full">
        <Icon className="size-[22px]" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-foreground/65">{label}</p>
        <p className="text-price text-2xl leading-tight">{value}</p>
        {hint ? <p className="truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
