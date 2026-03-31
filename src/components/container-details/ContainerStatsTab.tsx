import { Activity, Clock3 } from "lucide-react";
import { ContainerStatsMiniChart } from "@/components/container-details/ContainerStatsMiniChart";
import type { ContainerStatsSample, ContainerSummary } from "@/lib/api/types";

interface ContainerStatsTabProps {
  summary: ContainerSummary;
  stats: ContainerStatsSample[];
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function ContainerStatsTab({ summary, stats }: ContainerStatsTabProps) {
  const latest = stats.at(-1) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ContainerStatsMiniChart label="CPU" value={`${latest?.cpuPercent ?? summary.cpuPercent ?? 0}%`} percent={latest?.cpuPercent ?? summary.cpuPercent} />
        <ContainerStatsMiniChart label="Memory" value={latest ? formatBytes(latest.memoryUsageBytes) : summary.memUsage ?? "—"} percent={summary.memPercent} tone="warning" />
        <ContainerStatsMiniChart label="Network I/O" value={summary.netIO ?? "—"} />
        <ContainerStatsMiniChart label="Block I/O" value={summary.blockIO ?? "—"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <section className="rounded-md border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-sm font-semibold">
            <Activity className="h-4 w-4 text-primary" />
            Latest sample
          </div>
          {latest ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
                <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Sampled At</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">{latest.sampledAt}</dd>
              </div>
              <div className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
                <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">CPU</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">{latest.cpuPercent}%</dd>
              </div>
              <div className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
                <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Memory Used</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">{formatBytes(latest.memoryUsageBytes)}</dd>
              </div>
              <div className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
                <dt className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Memory Limit</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">{formatBytes(latest.memoryLimitBytes)}</dd>
              </div>
            </dl>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">No live sample is available for this container yet.</p>
          )}
        </section>

        <section className="rounded-md border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-sm font-semibold">
            <Clock3 className="h-4 w-4 text-primary" />
            Sample history
          </div>
          {stats.length > 1 ? (
            <div className="space-y-3">
              <div className="flex h-28 items-end gap-2 rounded-md border border-border/70 bg-background/60 p-3">
                {stats.map((sample) => (
                  <div key={sample.sampledAt} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className="w-full rounded-sm bg-primary/80"
                      style={{ height: `${Math.max(12, Math.min(sample.cpuPercent * 20, 96))}px` }}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">{sample.cpuPercent}%</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {stats.map((sample) => (
                  <div key={`${sample.sampledAt}-row`} className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
                    <div className="font-mono text-[11px] text-muted-foreground">{sample.sampledAt}</div>
                    <div className="mt-1 font-mono text-sm text-foreground">
                      CPU {sample.cpuPercent}% • Memory {formatBytes(sample.memoryUsageBytes)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="font-mono text-sm text-muted-foreground">Only a point-in-time sample is available for this container.</p>
          )}
        </section>
      </div>
    </div>
  );
}
