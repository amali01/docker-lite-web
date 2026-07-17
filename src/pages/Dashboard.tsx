import { Fragment, useState } from "react";
import { Box, Boxes, ChevronDown, ChevronRight, HardDrive, Image as ImageIcon, Network, Play, RotateCcw, Server, Square, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ApiState } from "@/components/ApiState";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { ContainerLogs } from "@/components/ContainerLogs";
import { ContainerExec } from "@/components/ContainerExec";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { MonitoringRow } from "@/components/MonitoringOptions";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useContainers,
  useRemoveContainer,
  useRestartContainer,
  useRebuildContainer,
  useStartContainer,
  useStopContainer,
} from "@/hooks/use-containers";
import { useEngineInfo } from "@/hooks/use-engine";
import { useImages } from "@/hooks/use-images";
import { useNetworks } from "@/hooks/use-networks";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useVolumes } from "@/hooks/use-volumes";
import { ContainerSummary } from "@/lib/api/types";
import { inferComposeProjectFromName, useResourceGroups } from "@/lib/resource-groups";

function formatMetric(value: string | number | null) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return `${value}%`;
  return value;
}

function projectOf(container: ContainerSummary) {
  if (container.composeProject) return container.composeProject;
  return inferComposeProjectFromName(container.name);
}


function PortLinks({ ports }: { ports: string | null | undefined }) {
  if (!ports || ports === "—") return <span>—</span>;
  const parts = ports.split(", ");
  return (
    <div className="flex flex-col gap-0.5">
      {parts.map((part, idx) => {
        if (part.includes("->")) {
          const hostPart = part.split("->")[0];
          const portMatch = hostPart.match(/:(\d+)$/);
          const port = portMatch ? portMatch[1] : null;
          if (port) {
            return (
              <a key={idx} href={`http://localhost:${port}`} target="_blank" rel="noreferrer" className="text-primary hover:underline hover:text-primary/80">
                {part}
              </a>
            );
          }
        }
        return <span key={idx}>{part}</span>;
      })}
    </div>
  );
}

function ContainerNameLink({ containerId, containerName, displayName }: { containerId: string; containerName: string; displayName: string }) {
  return (
    <Link
      to={`/containers/${containerId}`}
      className="block truncate text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
      title={containerName}
    >
      {displayName}
    </Link>
  );
}

export default function Dashboard() {
  const [terminalContainer, setTerminalContainer] = useState<ContainerSummary | null>(null);
  const [logsContainer, setLogsContainer] = useState<ContainerSummary | null>(null);
  const [expandedMonitoring, setExpandedMonitoring] = useState<Record<string, boolean>>({});
  const toggleMonitoring = (id: string) => {
    setExpandedMonitoring((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const engineQuery = useEngineInfo();
  const containersQuery = useContainers();
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const restartMutation = useRestartContainer();
  const rebuildMutation = useRebuildContainer();
  const removeMutation = useRemoveContainer();
  const imagesQuery = useImages();
  const volumesQuery = useVolumes();
  const networksQuery = useNetworks();

  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "running" | "stopped">("all");
  const allContainers = containersQuery.data ?? [];
  const containers = allContainers.filter(c => visibilityFilter === "all" || c.status === visibilityFilter);
  const images = imagesQuery.data ?? [];
  const volumes = volumesQuery.data ?? [];
  const networks = networksQuery.data ?? [];
  
  const selection = useTableSelection(containers.map((c) => c.id));
  const hasSelection = selection.selectedCount > 0;
  const selectedContainers = containers.filter((c) => selection.selectedIds.includes(c.id));

  const { rowEntries, expandedGroups, toggleGroup, groupSelectionState } = useResourceGroups({
    items: containers,
    getProject: projectOf,
    getId: (container) => container.id,
    selectedIds: selection.selectedIds,
  });

  if ([engineQuery, containersQuery, imagesQuery, volumesQuery, networksQuery].some((q) => q.isLoading)) {
    return <div className="p-6"><ApiState title="Loading dashboard" description="DockLite is fetching engine and resource data." /></div>;
  }

  if (engineQuery.error || containersQuery.error || imagesQuery.error || volumesQuery.error || networksQuery.error) {
    return <div className="p-6"><ApiState title="Docker connection unavailable" description="The local DockLite backend is not reachable or Docker is unavailable. Open Settings to test the configured API endpoint." /></div>;
  }

  const engine = engineQuery.data!;
  const running = allContainers.filter((c) => c.status === "running").length;
  const stopped = allContainers.filter((c) => c.status === "stopped").length;

  const handleAction = async (action: "start" | "stop" | "restart" | "remove" | "logs" | "terminal" | "rebuild", container: ContainerSummary) => {
    try {
      if (action === "start") { await startMutation.mutateAsync(container.id); toast.success(`Started ${container.name}`); return; }
      if (action === "stop") { await stopMutation.mutateAsync(container.id); toast.success(`Stopped ${container.name}`); return; }
      if (action === "restart") { await restartMutation.mutateAsync(container.id); toast.success(`Restarted ${container.name}`); return; }
      if (action === "rebuild") { await rebuildMutation.mutateAsync(container.id); toast.success(`Refreshed ${container.name}`); return; }
      if (action === "remove") {
        await removeMutation.mutateAsync(container.id);
        if (logsContainer?.id === container.id) setLogsContainer(null);
        toast.success(`Removed ${container.name}`);
        return;
      }
      if (action === "logs") {
        setTerminalContainer(null);
        setLogsContainer((c) => (c?.id === container.id ? null : container));
        return;
      }
      if (action === "terminal") {
        setLogsContainer(null);
        setTerminalContainer((c) => (c?.id === container.id ? null : container));
        return;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Docker action failed");
    }
  };

  const handleBulkAction = async (action: "start" | "stop" | "restart" | "remove") => {
    if (selectedContainers.length === 0) return;
    try {
      for (const container of selectedContainers) {
        if (action === "start") await startMutation.mutateAsync(container.id);
        else if (action === "stop") await stopMutation.mutateAsync(container.id);
        else if (action === "restart") await restartMutation.mutateAsync(container.id);
        else if (action === "remove") await removeMutation.mutateAsync(container.id);
      }
      selection.toggleAll(false);
      toast.success(`Bulk action '${action}' completed on ${selectedContainers.length} containers`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    }
  };

  const handleGroupAction = async (action: "start" | "stop" | "remove", project: string, groupContainers: ContainerSummary[]) => {
    try {
      for (const container of groupContainers) {
        if (action === "start" && container.status !== "running") await startMutation.mutateAsync(container.id);
        else if (action === "stop" && container.status === "running") await stopMutation.mutateAsync(container.id);
        else if (action === "remove") await removeMutation.mutateAsync(container.id);
      }
      toast.success(`Group action '${action}' completed for ${project}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Group action failed");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Docker Engine v{engine.dockerVersion} • API v{engine.apiVersion}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Containers" value={allContainers.length} icon={Box} subtitle={`${running} running, ${stopped} stopped`} accent />
        <StatCard label="Images" value={images.length} icon={ImageIcon} subtitle="Local image cache" />
        <StatCard label="Volumes" value={volumes.length} icon={HardDrive} subtitle="Persistent data volumes" />
        <StatCard label="Networks" value={networks.length} icon={Network} subtitle={`${networks.filter((n) => n.containers > 0).length} active`} />
      </div>

      <div className="bg-card border border-border rounded-md p-4">
        <h2 className="text-sm font-mono font-semibold mb-3 flex items-center gap-2"><Server className="w-4 h-4 text-primary" />System Information</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div><span className="text-muted-foreground block">OS / Arch</span><span className="text-foreground">{engine.os} / {engine.arch}</span></div>
          <div><span className="text-muted-foreground block">Kernel</span><span className="text-foreground">{engine.kernelVersion}</span></div>
          <div><span className="text-muted-foreground block">CPUs</span><span className="text-foreground">{engine.cpus} cores</span></div>
          <div><span className="text-muted-foreground block">Memory</span><span className="text-foreground">{engine.totalMemory}</span></div>
          <div><span className="text-muted-foreground block">Storage Driver</span><span className="text-foreground">{engine.storageDriver}</span></div>
          <div><span className="text-muted-foreground block">Docker Root</span><span className="text-foreground">{engine.rootDir}</span></div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h2 className="text-sm font-mono font-semibold flex items-center gap-2">
                <Box className="w-4 h-4 text-primary" />
                Containers
              </h2>
              <ToggleGroup
                type="single"
                value={visibilityFilter}
                onValueChange={(value) => {
                  if (value === "all" || value === "running" || value === "stopped") {
                    setVisibilityFilter(value);
                  }
                }}
                variant="outline"
                size="sm"
                className="justify-start"
              >
                <ToggleGroupItem value="all" className="font-mono text-[11px] tracking-wide h-7 px-3" aria-label="Show all containers">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="running" className="font-mono text-[11px] tracking-wide h-7 px-3" aria-label="Show running containers">
                  Running
                </ToggleGroupItem>
                <ToggleGroupItem value="stopped" className="font-mono text-[11px] tracking-wide h-7 px-3" aria-label="Show stopped containers">
                  Stopped
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          {hasSelection && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 h-9 py-0 md:ml-auto">
              <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                {selection.selectedCount} selected
              </span>
              <button type="button" onClick={() => void handleBulkAction("start")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90" title="Start selected containers">
                <Play className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void handleBulkAction("stop")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90" title="Stop selected containers">
                <Square className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void handleBulkAction("restart")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90" title="Restart selected containers">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => void handleBulkAction("remove")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected containers">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs lg:min-w-[52rem]">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
                <th className="w-10 p-3">
                  <Checkbox
                    aria-label="Select all dashboard containers"
                    checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  />
                </th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3 hidden md:table-cell">Image</th>
                <th className="text-left p-3 hidden sm:table-cell">Status</th>
                <th className="text-left p-3 hidden lg:table-cell">CPU</th>
                <th className="text-center p-3 hidden lg:table-cell">Memory</th>
                <th className="text-left p-3 hidden lg:table-cell">Ports</th>
                <th className="sticky right-0 z-20 bg-card text-right p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rowEntries.map((entry) => {
                if (entry.type === "group") {
                  const runningCount = entry.items.filter((c) => c.status === "running").length;
                  const groupState = groupSelectionState(entry.items);
                  return (
                    <Fragment key={`group-${entry.project}`}>
                      <tr onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], .cursor-default')) toggleGroup(entry.project); }} className="cursor-pointer group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <Checkbox checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => { entry.items.forEach((c) => selection.toggleOne(c.id, checked === true)); }} />
                        </td>
                        <td className="p-3 relative">
                          {expandedGroups[entry.project] && (
                            <div className="absolute left-5 top-1/2 -bottom-px w-px bg-primary/50 z-0" />
                          )}
                          <button type="button" onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left relative z-10">
                            {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary shrink-0" /> : <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                            <Boxes className="h-4 w-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <div className="font-mono font-medium text-foreground truncate max-w-[14rem] sm:max-w-[18rem] md:max-w-[14rem] lg:max-w-[18rem]" title={entry.project}>{(typeof entry.project === "string" && entry.project.length > 20) ? entry.project.substring(0, 20) + "…" : entry.project}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">Compose Stack • {entry.items.length} containers</div>
                            </div>
                          </button>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">Compose Stack</td>
                        <td className="p-3 hidden sm:table-cell"><span className="font-mono text-[11px] text-muted-foreground">{runningCount}/{entry.items.length} running</span></td>
                        <td className="p-3 text-muted-foreground hidden lg:table-cell">—</td>
                        <td className="p-3 text-muted-foreground hidden lg:table-cell">—</td>
                        <td className="p-3 text-muted-foreground hidden lg:table-cell">—</td>
                        <td className="sticky right-0 z-10 bg-muted p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                          <div className="flex items-center justify-end gap-1">
                            {runningCount === 0 ? (
                              <button onClick={() => void handleGroupAction("start", entry.project, entry.items)} className="rounded p-1.5 text-success transition-colors hover:bg-success/10" title="Start stack"><Play className="h-3.5 w-3.5" /></button>
                            ) : (
                              <button onClick={() => void handleGroupAction("stop", entry.project, entry.items)} className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10" title="Stop stack"><Square className="h-3.5 w-3.5" /></button>
                            )}
                            <button onClick={() => void handleGroupAction("remove", entry.project, entry.items)} className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10" title="Delete stack"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                      {expandedGroups[entry.project] && entry.items.map((container, index, arr) => (
                        <Fragment key={container.id}>
                        <tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], .cursor-default')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3"><Checkbox aria-label={`Select dashboard container ${container.name}`} checked={selection.selectedIds.includes(container.id)} onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)} /></td>
                          <td className="p-3 relative">
                            <div className="absolute left-5 top-0 bottom-1/2 w-px bg-primary/50 z-0" />
                            {index !== arr.length - 1 && (
                              <div className="absolute left-5 top-1/2 -bottom-px w-px bg-primary/50 z-0" />
                            )}
                            <div className="absolute left-5 top-1/2 w-5 h-px bg-primary/50 z-0" />
                            <div className="flex items-center gap-2 pl-6 relative z-10">
                              <div className="h-2 w-2 rounded-full border border-primary/60 bg-background shrink-0" />
                              <div className="font-mono font-medium max-w-[8rem] md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]">
                                <ContainerNameLink
                                  containerId={container.id}
                                  containerName={container.name}
                                  displayName={(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground hidden md:table-cell"><div className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]" title={container.image}>{(typeof container.image === "string" && container.image.length > 20) ? container.image.substring(0, 20) + "…" : container.image}</div></td>
                          <td className="p-3 hidden sm:table-cell"><StatusBadge status={container.status} /></td>
                          <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{formatMetric(container.cpuPercent)}</td>
                          <td className="p-3 text-center align-middle hidden lg:table-cell">
          <div className="flex flex-col items-center justify-center" title={container.memUsage || "N/A"}>
            <div className="relative w-10 h-5 flex items-end justify-center mb-1">
              <svg viewBox="0 0 100 50" className="absolute top-0 left-0 w-full h-full overflow-visible">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" className="stroke-muted/30" strokeWidth="12" strokeLinecap="round" />
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  className={`transition-all duration-500 ease-in-out ${(container.memPercent || 0) > 80 ? 'stroke-destructive' : 'stroke-primary'}`}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray="125.6"
                  strokeDashoffset={125.6 - ((container.memPercent || 0) / 100) * 125.6}
                />
              </svg>
              <span className="text-[10px] font-mono leading-none z-10 font-bold translate-y-[2px]">
                {container.memPercent ? container.memPercent.toFixed(0) : "0"}%
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono leading-none">
              {container.memUsage ? container.memUsage.replace(/\s*\/.*/, "").trim() : "—"}
            </span>
          </div>
        </td>
                          <td className="p-3 font-mono text-muted-foreground text-[11px] hidden lg:table-cell"><PortLinks ports={container.ports} /></td>
                          <td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                            <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                          </td>
                        </tr>
                        {expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} isLast={index === arr.length - 1} />}
                      </Fragment>
                      ))}
                    </Fragment>
                  );
                }
                const container = entry.item;
                return (
                  <Fragment key={container.id}>
                  <tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], .cursor-default')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">
                    <td className="p-3"><Checkbox aria-label={`Select dashboard container ${container.name}`} checked={selection.selectedIds.includes(container.id)} onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)} /></td>
                    <td className="p-3 font-mono font-medium">
                      <div className="max-w-[8rem] md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]">
                        <ContainerNameLink
                          containerId={container.id}
                          containerName={container.name}
                          displayName={(typeof container.name === "string" && container.name.length > 20) ? container.name.substring(0, 20) + "…" : container.name}
                        />
                      </div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground hidden md:table-cell"><div className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]" title={container.image}>{(typeof container.image === "string" && container.image.length > 20) ? container.image.substring(0, 20) + "…" : container.image}</div></td>
                    <td className="p-3 hidden sm:table-cell"><StatusBadge status={container.status} /></td>
                    <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{formatMetric(container.cpuPercent)}</td>
                    <td className="p-3 text-center align-middle hidden lg:table-cell">
          <div className="flex flex-col items-center justify-center" title={container.memUsage || "N/A"}>
            <div className="relative w-10 h-5 flex items-end justify-center mb-1">
              <svg viewBox="0 0 100 50" className="absolute top-0 left-0 w-full h-full overflow-visible">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" className="stroke-muted/30" strokeWidth="12" strokeLinecap="round" />
                <path 
                  d="M 10 50 A 40 40 0 0 1 90 50" 
                  fill="none" 
                  className={`transition-all duration-500 ease-in-out ${(container.memPercent || 0) > 80 ? 'stroke-destructive' : 'stroke-primary'}`} 
                  strokeWidth="12" 
                  strokeLinecap="round" 
                  strokeDasharray="125.6" 
                  strokeDashoffset={125.6 - ((container.memPercent || 0) / 100) * 125.6} 
                />
              </svg>
              <span className="text-[10px] font-mono leading-none z-10 font-bold translate-y-[2px]">
                {container.memPercent ? container.memPercent.toFixed(0) : "0"}%
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono leading-none">
              {container.memUsage ? container.memUsage.replace(/\s*\/.*/, "").trim() : "—"}
            </span>
          </div>
        </td>
                    <td className="p-3 font-mono text-muted-foreground text-[11px] hidden lg:table-cell"><PortLinks ports={container.ports} /></td>
                    <td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                      <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                    </td>
                  </tr>
                  {expandedMonitoring[container.id] && <MonitoringRow container={container} />}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {logsContainer && <ContainerLogs containerId={logsContainer.id} containerName={logsContainer.name} onClose={() => setLogsContainer(null)} />}
      {terminalContainer && (
        <div className="fixed right-0 top-0 bottom-0 w-[600px] border-l shadow-2xl bg-card z-50 flex flex-col max-w-[90vw]">
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <h3 className="font-semibold text-sm truncate pr-4">Terminal: {terminalContainer.name.replace(/^\//, "")}</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setTerminalContainer(null)}>
              <span className="sr-only">Close terminal</span>
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
            </Button>
          </div>
          <div className="flex-1 overflow-hidden bg-black p-2 relative">
            <ContainerExec 
              containerId={terminalContainer.id} 
              containerName={terminalContainer.name} 
              onClose={() => setTerminalContainer(null)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
