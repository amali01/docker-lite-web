import { HardDrive, Network, Tags } from "lucide-react";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { Badge } from "@/components/ui/badge";
import { ContainerStatsMiniChart } from "@/components/container-details/ContainerStatsMiniChart";
import type { ContainerDetails } from "@/lib/api/types";

interface ContainerOverviewTabProps {
  details: ContainerDetails;
}

export function ContainerOverviewTab({ details }: ContainerOverviewTabProps) {
  const { summary } = details;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ContainerStatsMiniChart label="CPU" value={`${summary.cpuPercent ?? 0}%`} percent={summary.cpuPercent} />
        <ContainerStatsMiniChart label="Memory" value={summary.memUsage ?? "—"} percent={summary.memPercent} tone="warning" />
        <ContainerStatsMiniChart label="Network I/O" value={summary.netIO ?? "—"} />
        <ContainerStatsMiniChart label="Block I/O" value={summary.blockIO ?? "—"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.9fr)]">
        <section className="space-y-4 rounded-md border border-border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Image</p>
              <p className="font-mono text-sm text-foreground">{summary.image}</p>
            </div>
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Compose</p>
              <p className="font-mono text-sm text-foreground">
                {summary.composeProject && summary.composeService
                  ? `${summary.composeProject} / ${summary.composeService}`
                  : "Standalone container"}
              </p>
            </div>
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Ports</p>
              <p className="font-mono text-sm text-foreground">{summary.ports || "No published ports"}</p>
            </div>
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">Created</p>
              <p className="font-mono text-sm text-foreground">{summary.created}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              Mounts
            </div>
            <div className="space-y-2">
              {details.mounts.length > 0 ? (
                details.mounts.map((mount) => (
                  <div key={`${mount.source}-${mount.destination}`} className="rounded-md border border-border/70 bg-background/60 p-3">
                    <div className="font-mono text-sm text-foreground">
                      {mount.source} <span className="text-muted-foreground">→</span> {mount.destination}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {mount.type}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {mount.readOnly ? "read-only" : "read-write"}
                      </Badge>
                      {mount.propagation ? (
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {mount.propagation}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="font-mono text-sm text-muted-foreground">No mounts attached.</p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-md border border-border bg-card p-5">
          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              <Network className="h-3.5 w-3.5" />
              Quick Actions
            </div>
            <ContainerActionButtons container={summary} onAction={() => {}} />
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              <Tags className="h-3.5 w-3.5" />
              Labels
            </div>
            <div className="space-y-2">
              {details.labels.length > 0 ? (
                details.labels.map((label) => (
                  <div key={label.key} className="rounded-md border border-border/70 bg-background/60 px-3 py-2">
                    <div className="font-mono text-[11px] text-muted-foreground">{label.key}</div>
                    <div className="mt-1 break-all font-mono text-sm text-foreground">{label.value}</div>
                  </div>
                ))
              ) : (
                <p className="font-mono text-sm text-muted-foreground">No labels on this container.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
