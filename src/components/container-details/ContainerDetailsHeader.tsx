import { ArrowLeft, Box, Cpu, Server } from "lucide-react";
import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import type { ContainerSummary } from "@/lib/api/types";

interface ContainerDetailsHeaderProps {
  container: ContainerSummary;
  endpoint: string;
}

export function ContainerDetailsHeader({ container, endpoint }: ContainerDetailsHeaderProps) {
  return (
    <header className="space-y-4 rounded-md border border-border bg-card p-4 sm:p-5">
      <Link
        to="/containers"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to containers
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight break-all sm:text-2xl">{container.name}</h1>
            <StatusBadge status={container.status} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
              <Box className="h-3 w-3" />
              {container.image}
            </Badge>
            {container.composeProject ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                {container.composeProject}
              </Badge>
            ) : null}
            {container.composeService ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                {container.composeService}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
          <div className="rounded-md border border-border/70 bg-background/70 px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide">
              <Server className="h-3 w-3" />
              Engine
            </div>
            <div className="break-all text-foreground">{endpoint}</div>
          </div>
          <div className="rounded-md border border-border/70 bg-background/70 px-3 py-2">
            <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide">
              <Cpu className="h-3 w-3" />
              Runtime
            </div>
            <div className="text-foreground">{container.state}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
