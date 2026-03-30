import { Fragment, useEffect, useMemo, useState } from "react";
import { Box, Boxes, ChevronDown, ChevronRight, HardDrive, Image as ImageIcon, Network, Play, RotateCcw, Server, Square, Trash2 } from "lucide-react";
import { ApiState } from "@/components/ApiState";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { ContainerLogs } from "@/components/ContainerLogs";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useContainers,
  useRemoveContainer,
  useRestartContainer,
  useStartContainer,
  useStopContainer,
} from "@/hooks/use-containers";
import { useEngineInfo } from "@/hooks/use-engine";
import { useImages } from "@/hooks/use-images";
import { useNetworks } from "@/hooks/use-networks";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useVolumes } from "@/hooks/use-volumes";
import { ContainerSummary } from "@/lib/api/types";

function formatMetric(value: string | number | null) {
  if (value == null || value === "") return "—";
  return value;
}

type ContainerRowEntry =
  | { type: "group"; project: string; containers: ContainerSummary[] }
  | { type: "container"; container: ContainerSummary };

function inferComposeProject(container: ContainerSummary) {
  if (container.composeProject) return container.composeProject;
  const normalizedName = container.name.replace(/_/g, "-");
  const parts = normalizedName.split("-").filter(Boolean);
  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1) ?? "")) return parts.slice(0, -2).join("-");
  if (parts.length >= 2) return parts.slice(0, -1).join("-");
  return null;
}

export default function Dashboard() {
  const [logsContainer, setLogsContainer] = useState<ContainerSummary | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const engineQuery = useEngineInfo();
  const containersQuery = useContainers();
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const restartMutation = useRestartContainer();
  const removeMutation = useRemoveContainer();
  const imagesQuery = useImages();
  const volumesQuery = useVolumes();
  const networksQuery = useNetworks();

  const containers = containersQuery.data ?? [];
  const images = imagesQuery.data ?? [];
  const volumes = volumesQuery.data ?? [];
  const networks = networksQuery.data ?? [];
  
  const selection = useTableSelection(containers.map((c) => c.id));
  const hasSelection = selection.selectedCount > 0;
  const selectedContainers = containers.filter((c) => selection.selectedIds.includes(c.id));

  const rowEntries = useMemo(() => {
    const composeGroups = new Map<string, ContainerSummary[]>();
    for (const container of containers) {
      const project = inferComposeProject(container);
      if (project) composeGroups.set(project, [...(composeGroups.get(project) ?? []), container]);
    }

    const seenGroups = new Set<string>();
    const entries: ContainerRowEntry[] = [];
    for (const container of containers) {
      const project = inferComposeProject(container);
      if (project && (composeGroups.get(project)?.length ?? 0) > 1) {
        if (!seenGroups.has(project)) {
          entries.push({ type: "group", project, containers: composeGroups.get(project)! });
          seenGroups.add(project);
        }
        continue;
      }
      entries.push({ type: "container", container });
    }
    return entries;
  }, [containers]);

  const visibleGroupIds = useMemo(() => rowEntries.filter((e): e is Extract<ContainerRowEntry, { type: "group" }> => e.type === "group").map(e => e.project), [rowEntries]);

  useEffect(() => {
    setExpandedGroups((current) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const groupId of visibleGroupIds) {
        next[groupId] = current[groupId] ?? true;
        if (next[groupId] !== current[groupId]) changed = true;
      }
      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [visibleGroupIds]);

  if ([engineQuery, containersQuery, imagesQuery, volumesQuery, networksQuery].some((q) => q.isLoading)) {
    return <div className="p-6"><ApiState title="Loading dashboard" description="DockLite is fetching engine and resource data." /></div>;
  }

  if (engineQuery.error || containersQuery.error || imagesQuery.error || volumesQuery.error || networksQuery.error) {
    return <div className="p-6"><ApiState title="Docker connection unavailable" description="The local DockLite backend is not reachable or Docker is unavailable. Open Settings to test the configured API endpoint." /></div>;
  }

  const engine = engineQuery.data!;
  const running = containers.filter((c) => c.status === "running").length;
  const stopped = containers.filter((c) => c.status === "stopped").length;

  const handleAction = async (action: "start" | "stop" | "restart" | "remove" | "logs" | "terminal", container: ContainerSummary) => {
    try {
      if (action === "start") { await startMutation.mutateAsync(container.id); toast.success(`Started ${container.name}`); return; }
      if (action === "stop") { await stopMutation.mutateAsync(container.id); toast.success(`Stopped ${container.name}`); return; }
      if (action === "restart") { await restartMutation.mutateAsync(container.id); toast.success(`Restarted ${container.name}`); return; }
      if (action === "remove") {
        await removeMutation.mutateAsync(container.id);
        if (logsContainer?.id === container.id) setLogsContainer(null);
        toast.success(`Removed ${container.name}`);
        return;
      }
      if (action === "logs") { setLogsContainer((c) => (c?.id === container.id ? null : container)); return; }
      toast.info("Container exec terminal is not implemented yet.");
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

  const toggleGroup = (project: string) => setExpandedGroups(c => ({ ...c, [project]: !c[project] }));
  const groupSelectionState = (groupContainers: ContainerSummary[]) => {
    const selected = groupContainers.filter(c => selection.selectedIds.includes(c.id)).length;
    return { allSelected: selected === groupContainers.length && groupContainers.length > 0, partiallySelected: selected > 0 && selected < groupContainers.length };
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Docker Engine v{engine.dockerVersion} • API v{engine.apiVersion}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Containers" value={containers.length} icon={Box} subtitle={`${running} running, ${stopped} stopped`} accent />
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
          <h2 className="text-sm font-mono font-semibold flex items-center gap-2">
            <Box className="w-4 h-4 text-primary" />
            Containers
          </h2>
          {hasSelection && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 md:ml-auto">
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
          <table className="min-w-[52rem] w-full text-xs">
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
                <th className="text-left p-3">Image</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">CPU</th>
                <th className="text-left p-3">Memory</th>
                <th className="text-left p-3">Ports</th>
                <th className="sticky right-0 z-20 bg-card text-right p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rowEntries.map((entry) => {
                if (entry.type === "group") {
                  const runningCount = entry.containers.filter((c) => c.status === "running").length;
                  const groupState = groupSelectionState(entry.containers);
                  return (
                    <Fragment key={`group-${entry.project}`}>
                      <tr className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <Checkbox checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => { entry.containers.forEach((c) => selection.toggleOne(c.id, checked === true)); }} />
                        </td>
                        <td className="p-3">
                          <button type="button" onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left">
                            {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                            <Boxes className="h-4 w-4 text-primary" />
                            <div>
                              <div className="font-mono font-medium text-foreground">{entry.project}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">Compose Stack • {entry.containers.length} containers</div>
                            </div>
                          </button>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">Compose Stack</td>
                        <td className="p-3"><span className="font-mono text-[11px] text-muted-foreground">{runningCount}/{entry.containers.length} running</span></td>
                        <td className="p-3 text-muted-foreground">—</td>
                        <td className="p-3 text-muted-foreground">—</td>
                        <td className="p-3 text-muted-foreground">—</td>
                        <td className="sticky right-0 z-10 bg-muted/20 p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted/30">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => void handleGroupAction("start", entry.project, entry.containers)} className="rounded p-1.5 text-success transition-colors hover:bg-success/10" title="Start stack"><Play className="h-3.5 w-3.5" /></button>
                            <button onClick={() => void handleGroupAction("stop", entry.project, entry.containers)} className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10" title="Stop stack"><Square className="h-3.5 w-3.5" /></button>
                            <button onClick={() => void handleGroupAction("remove", entry.project, entry.containers)} className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10" title="Delete stack"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                      {expandedGroups[entry.project] && entry.containers.map((container) => (
                        <tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="p-3"><Checkbox aria-label={`Select dashboard container ${container.name}`} checked={selection.selectedIds.includes(container.id)} onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)} /></td>
                          <td className="p-3 pl-8">
                            <div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={container.name}>{container.name}</div>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground"><div className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]" title={container.image}>{container.image}</div></td>
                          <td className="p-3"><StatusBadge status={container.status} /></td>
                          <td className="p-3 font-mono text-muted-foreground">{formatMetric(container.cpuPercent)}</td>
                          <td className="p-3 font-mono text-muted-foreground">{formatMetric(container.memUsage)}</td>
                          <td className="p-3 font-mono text-muted-foreground text-[11px]">{container.ports || "—"}</td>
                          <td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted/30">
                            <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                }
                const container = entry.container;
                return (
                  <tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">
                    <td className="p-3"><Checkbox aria-label={`Select dashboard container ${container.name}`} checked={selection.selectedIds.includes(container.id)} onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)} /></td>
                    <td className="p-3 font-mono font-medium text-foreground"><div className="max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={container.name}>{container.name}</div></td>
                    <td className="p-3 font-mono text-muted-foreground"><div className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]" title={container.image}>{container.image}</div></td>
                    <td className="p-3"><StatusBadge status={container.status} /></td>
                    <td className="p-3 font-mono text-muted-foreground">{formatMetric(container.cpuPercent)}</td>
                    <td className="p-3 font-mono text-muted-foreground">{formatMetric(container.memUsage)}</td>
                    <td className="p-3 font-mono text-muted-foreground text-[11px]">{container.ports || "—"}</td>
                    <td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted/30">
                      <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {logsContainer && <ContainerLogs containerId={logsContainer.id} containerName={logsContainer.name} onClose={() => setLogsContainer(null)} />}
    </div>
  );
}
