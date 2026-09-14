import { Activity, Clock3 } from "lucide-react";
import { ContainerStatsMiniChart } from "@/components/container-details/ContainerStatsMiniChart";
import { STATS_POLL_INTERVAL_MS, useContainerStatsHistory } from "@/hooks/use-containers";
import type { ContainerStatsSample, ContainerSummary } from "@/lib/api/types";

interface ContainerStatsTabProps {
  summary: ContainerSummary;
  stats: ContainerStatsSample[];
}

/** The chart shows every retained sample; the rows below would be a wall of text. */
const RECENT_SAMPLE_ROWS = 6;
const POLL_SECONDS = STATS_POLL_INTERVAL_MS / 1000;

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
  // Polling lives with this component: mounted only while the Stats tab is the
  // selected tab, so leaving the tab stops the calls.
  const history = useContainerStatsHistory(summary.id);
  const samples = history.length > 0 ? history : stats;
  const latest = samples.at(-1) ?? null;
  const peakCpuPercent = Math.max(...samples.map((sample) => sample.cpuPercent), 0);

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
          {samples.length > 1 ? (
            <div className="space-y-3">
              <div className="flex h-28 items-end gap-1 rounded-md border border-border/70 bg-background/60 p-3">
                {samples.map((sample) => (
                  <div
                    key={sample.sampledAt}
                    data-testid="stats-cpu-bar"
                    title={`${sample.sampledAt} — CPU ${sample.cpuPercent}%`}
                    className="min-w-0 flex-1 rounded-sm bg-primary/80"
                    style={{ height: `${Math.max(4, (sample.cpuPercent / (peakCpuPercent || 1)) * 100)}%` }}
                  />
                ))}
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                CPU over the last {samples.length} samples, one every {POLL_SECONDS}s · peak {peakCpuPercent}%
              </p>
              <div className="space-y-2">
                {samples.slice(-RECENT_SAMPLE_ROWS).map((sample) => (
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
            <p className="font-mono text-sm text-muted-foreground">
              Collecting history — {samples.length === 0 ? "no samples" : "one sample"} so far. DockLite takes another every{" "}
              {POLL_SECONDS}s while this tab is open.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
