import { cn } from "@/lib/utils";

interface ContainerStatsMiniChartProps {
  label: string;
  value: string;
  percent?: number | null;
  tone?: "primary" | "warning";
}

export function ContainerStatsMiniChart({
  label,
  value,
  percent,
  tone = "primary",
}: ContainerStatsMiniChartProps) {
  const normalizedPercent = Math.max(0, Math.min(percent ?? 0, 100));

  return (
    <div className="rounded-md border border-border/70 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="text-foreground">{value}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width]", tone === "warning" ? "bg-warning" : "bg-primary")}
          style={{ width: `${normalizedPercent}%` }}
        />
      </div>
    </div>
  );
}
