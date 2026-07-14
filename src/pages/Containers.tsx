import { Fragment, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Play, Plus, RotateCcw, Search, Square, Trash2, Activity } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { ApiState } from "@/components/ApiState";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { MonitoringRow } from "@/components/MonitoringOptions";
import { ContainerLogs } from "@/components/ContainerLogs";
import { ContainerExec } from "@/components/ContainerExec";
import { RunContainerDialog } from "@/components/RunContainerDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useContainers,
  useRemoveComposeProject,
  useRemoveContainer,
  useRestartContainer,
  useRebuildContainer,
  useRunContainer,
  useStartComposeProject,
  useStartContainer,
  useStopComposeProject,
  useStopContainer,
} from "@/hooks/use-containers";
import { useTableSelection } from "@/hooks/use-table-selection";
import { ContainerSummary, RunContainerPayload } from "@/lib/api/types";
import { inferComposeProjectFromName, useResourceGroups } from "@/lib/resource-groups";

function projectOf(container: ContainerSummary) {
  if (container.composeProject) {
    return container.composeProject;
  }

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



export default function Containers() {

  const [filter, setFilter] = useState("");
  const [expandedMonitoring, setExpandedMonitoring] = useState<Record<string, boolean>>({});
  const toggleMonitoring = (id: string) => {
    setExpandedMonitoring(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "running" | "stopped">("all");
  const [terminalContainer, setTerminalContainer] = useState<ContainerSummary | null>(null);
  const [logsContainer, setLogsContainer] = useState<ContainerSummary | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const containersQuery = useContainers();
  const runMutation = useRunContainer();
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const restartMutation = useRestartContainer();
  const rebuildMutation = useRebuildContainer();
  const removeMutation = useRemoveContainer();
  const startComposeProjectMutation = useStartComposeProject();
  const stopComposeProjectMutation = useStopComposeProject();
  const removeComposeProjectMutation = useRemoveComposeProject();
  const containers = containersQuery.data ?? [];
  const normalizedFilter = filter.toLowerCase();
  const filtered = containers.filter((container) => {
    const matchesVisibility = visibilityFilter === "all" || container.status === visibilityFilter;
    const matchesText =
      container.name.toLowerCase().includes(normalizedFilter) ||
      container.image.toLowerCase().includes(normalizedFilter);

    return matchesVisibility && matchesText;
  });
  const selection = useTableSelection(filtered.map((container) => container.id));
  const selectedContainers = containers.filter((container) => selection.selectedIds.includes(container.id));
  const hasSelection = selection.selectedCount > 0;
  const { rowEntries, expandedGroups, toggleGroup, groupSelectionState } = useResourceGroups({
    items: filtered,
    getProject: projectOf,
    getId: (container) => container.id,
    selectedIds: selection.selectedIds,
  });

  if (containersQuery.isLoading) {
    return (
      <div className="p-6">
        <ApiState title="Loading containers" description="DockLite is fetching the current container list." />
      </div>
    );
  }

  if (containersQuery.error) {
    return (
      <div className="p-6">
        <ApiState
          title="Unable to load containers"
          description="The backend could not fetch Docker containers. Verify Docker access in Settings."
        />
      </div>
    );
  }

  const handleAction = async (action: "start" | "stop" | "restart" | "remove" | "logs" | "terminal" | "rebuild", container: ContainerSummary) => {
    try {
      if (action === "start") {
        await startMutation.mutateAsync(container.id);
        toast.success(`Started ${container.name}`);
        return;
      }

      if (action === "stop") {
        await stopMutation.mutateAsync(container.id);
        toast.success(`Stopped ${container.name}`);
        return;
      }

      if (action === "restart") {
        await restartMutation.mutateAsync(container.id);
        toast.success(`Restarted ${container.name}`);
        return;
      }
      if (action === "rebuild") {
        toast.info(`Refreshing ${container.name}...`);
        await rebuildMutation.mutateAsync(container.id);
        toast.success(`Refreshed ${container.name}`);
        return;
      }

      if (action === "remove") {
        await removeMutation.mutateAsync(container.id);
        if (logsContainer?.id === container.id) {
          setLogsContainer(null);
        }
        toast.success(`Removed ${container.name}`);
        return;
      }

      if (action === "logs") {
        setTerminalContainer(null);
        setLogsContainer((current) => (current?.id === container.id ? null : container));
        return;
      }
      
      if (action === "terminal") {
        setLogsContainer(null);
        setTerminalContainer((current) => (current?.id === container.id ? null : container));
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Docker action failed";
      toast.error(message);
    }
  };

  const handleRunContainer = async (payload: RunContainerPayload) => {
    try {
      const container = await runMutation.mutateAsync(payload);
      toast.success(`Container ${container.name} started`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to run container";
      toast.error(message);
      throw error;
    }
  };

  const handleGroupAction = async (action: "start" | "stop" | "remove", project: string, projectContainers: ContainerSummary[]) => {
    try {
      if (action === "start") {
        await startComposeProjectMutation.mutateAsync(project);
        toast.success(`Started compose stack ${project}`);
        return;
      }

      if (action === "stop") {
        await stopComposeProjectMutation.mutateAsync(project);
        toast.success(`Stopped compose stack ${project}`);
        return;
      }

      await removeComposeProjectMutation.mutateAsync(project);

      if (logsContainer && projectContainers.some((container) => container.id === logsContainer.id)) {
        setLogsContainer(null);
      }

      toast.success(`Deleted compose stack ${project}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Compose stack action failed";
      toast.error(message);
    }
  };

  const handleBulkAction = async (action: "start" | "stop" | "restart" | "remove") => {
    const currentSelection = [...selectedContainers];

    if (currentSelection.length === 0) {
      return;
    }

    try {
      for (const container of currentSelection) {
        if (action === "start") {
          await startMutation.mutateAsync(container.id);
          continue;
        }

        if (action === "stop") {
          await stopMutation.mutateAsync(container.id);
          continue;
        }

        if (action === "restart") {
          await restartMutation.mutateAsync(container.id);
          continue;
        }

        await removeMutation.mutateAsync(container.id);
      }

      if (action === "remove" && logsContainer && currentSelection.some((container) => container.id === logsContainer.id)) {
        setLogsContainer(null);
      }

      selection.toggleAll(false);
      toast.success(`${action === "remove" ? "Removed" : action === "restart" ? "Restarted" : action === "start" ? "Started" : "Stopped"} ${currentSelection.length} container${currentSelection.length === 1 ? "" : "s"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bulk Docker action failed";
      toast.error(message);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Containers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {containers.length} total • {containers.filter((container) => container.status === "running").length} running
          </p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs" onClick={() => setRunDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Run Container
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter containers..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="pl-9 bg-card border-border font-mono text-sm h-9"
          />
        </div>
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
          className="justify-start md:justify-end"
        >
          <ToggleGroupItem value="all" className="font-mono text-[11px] tracking-wide" aria-label="Show all containers">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="running" className="font-mono text-[11px] tracking-wide" aria-label="Show running containers">
            Running
          </ToggleGroupItem>
          <ToggleGroupItem value="stopped" className="font-mono text-[11px] tracking-wide" aria-label="Show stopped containers">
            Stopped
          </ToggleGroupItem>
        </ToggleGroup>
        {hasSelection && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 h-9 py-0 md:ml-auto">
            <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
              {selection.selectedCount} selected
            </span>
            <button
              type="button"
              onClick={() => void handleBulkAction("start")}
              className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              title="Start selected containers"
            >
              <Play className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleBulkAction("stop")}
              className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              title="Stop selected containers"
            >
              <Square className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleBulkAction("restart")}
              className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              title="Restart selected containers"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void handleBulkAction("remove")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected containers"><Trash2 className="h-4 w-4" /></button>
            
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs lg:min-w-[56rem]">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
                <th className="w-10 p-3">
                  <Checkbox
                    aria-label="Select all containers"
                    checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                  />
                </th>
                <th className="text-left p-3">Container</th>
                <th className="text-left p-3 hidden md:table-cell">Image</th>
                <th className="text-left p-3 hidden sm:table-cell">Status</th>
                <th className="text-left p-3 hidden lg:table-cell">CPU</th>
                <th className="text-center p-3 hidden lg:table-cell">Memory</th>
                <th className="text-left p-3 hidden xl:table-cell">Network I/O</th>
                <th className="text-left p-3 hidden lg:table-cell">Ports</th>
                <th className="sticky right-0 z-20 bg-card text-right p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rowEntries.map((entry) => {
                if (entry.type === "group") {
                  const runningCount = entry.items.filter((container) => container.status === "running").length;
                  const groupState = groupSelectionState(entry.items);

                  return (
                    <Fragment key={`group-${entry.project}`}>
                      <tr key={`group-${entry.project}`} onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], .cursor-default')) toggleGroup(entry.project); }} className="cursor-pointer group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <Checkbox
                            aria-label={`Select compose stack ${entry.project}`}
                            checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => {
                              for (const container of entry.items) {
                                selection.toggleOne(container.id, checked === true);
                              }
                            }}
                          />
                        </td>
                        <td className="p-3 relative">
                          {expandedGroups[entry.project] && (
                            <div className="absolute left-5 top-1/2 -bottom-px w-px bg-primary/50 z-0" />
                          )}
                          <button
                            type="button"
                            onClick={() => toggleGroup(entry.project)}
                            className="flex items-center gap-2 text-left relative z-10"
                            aria-label={`${expandedGroups[entry.project] ? "Collapse" : "Expand"} compose stack ${entry.project}`}
                          >
                            {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary shrink-0" /> : <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                            <Boxes className="h-4 w-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <div className="font-mono font-medium text-foreground truncate max-w-[14rem] sm:max-w-[18rem] md:max-w-[14rem] lg:max-w-[18rem]" title={entry.project}>{entry.project}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {entry.items.length} containers
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">Compose Stack</td>
                        <td className="p-3 hidden sm:table-cell">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {runningCount}/{entry.items.length} running
                          </span>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">—</td>
                        <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">—</td>
                        <td className="p-3 font-mono text-muted-foreground hidden xl:table-cell">—</td>
                        <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">—</td>
                        <td className="sticky right-0 z-10 bg-muted p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => void handleGroupAction("start", entry.project, entry.items)}
                              className="rounded p-1.5 text-success transition-colors hover:bg-success/10"
                              title="Start stack"
                            >
                              <Play className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleGroupAction("stop", entry.project, entry.items)}
                              className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                              title="Stop stack"
                            >
                              <Square className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleGroupAction("remove", entry.project, entry.items)}
                              className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10"
                              title="Delete stack"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedGroups[entry.project] &&
                        entry.items.map((container, index, arr) => (
                          <Fragment key={container.id}>
<tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], .cursor-default')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="p-3">
                              <Checkbox
                                aria-label={`Select container ${container.name}`}
                                checked={selection.selectedIds.includes(container.id)}
                                onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)}
                              />
                            </td>
                            <td className="p-3 relative">
                              <div className="absolute left-5 top-0 bottom-1/2 w-px bg-primary/50 z-0" />
                              {index !== arr.length - 1 && (
                                <div className="absolute left-5 top-1/2 -bottom-px w-px bg-primary/50 z-0" />
                              )}
                              <div className="absolute left-5 top-1/2 w-5 h-px bg-primary/50 z-0" />
                              <div className="flex items-center gap-2 pl-6 relative z-10">
                                <div className="h-2 w-2 rounded-full border border-primary/60 bg-background shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-mono font-medium truncate max-w-[10rem] sm:max-w-[12rem] md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]">
                                    <ContainerNameLink
                                      containerId={container.id}
                                      containerName={container.name}
                                      displayName={(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}
                                    />
                                  </div>
                                  <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[10rem]">{container.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">
                              <div
                                className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]"
                                title={container.image}
                              >
                                {(typeof container.image === "string" && container.image.length > 20) ? container.image.substring(0, 20) + "…" : container.image}
                              </div>
                            </td>
                            <td className="p-3 hidden sm:table-cell">
                              <StatusBadge status={container.status} />
                              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{container.state}</div>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{container.cpuPercent != null ? `${container.cpuPercent}%` : "—"}</td>
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
                    <td className="p-3 hidden xl:table-cell">
  {container.netIO && (container.netIO.includes(",") || container.netIO.includes("/")) ? (
    <div className="flex flex-col text-[12px] font-mono leading-[1.3] text-muted-foreground w-max">
      <div className="text-blue-400 flex items-center gap-1" title="Download">
        <span className="w-3 text-center">↓</span>
        <span>{container.netIO.includes(",") ? container.netIO.split(",")[0].replace(/[↓,]/g, "").trim() : container.netIO.split("/")[0].trim()}</span>
      </div>
      <div className="text-emerald-400 flex items-center gap-1" title="Upload">
        <span className="w-3 text-center">↑</span>
        <span>{container.netIO.includes(",") ? container.netIO.split(",")[1].replace(/[↑,]/g, "").trim() : container.netIO.split("/")[1].trim()}</span>
      </div>
    </div>
  ) : (
    <div className="font-mono text-muted-foreground text-sm">{container.netIO ?? "—"}</div>
  )}
</td>
                            <td className="p-3 font-mono text-muted-foreground text-[11px] hidden lg:table-cell"><PortLinks ports={container.ports} /></td>
                            <td className="sticky right-0 z-10 bg-card p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                              <div className="flex items-center justify-end gap-1">
                              <button onClick={() => toggleMonitoring(container.id)} className={`p-1.5 rounded transition-colors hidden lg:inline-flex ${expandedMonitoring[container.id] ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"}`} title="Monitoring Options">
                                <Activity className="w-3.5 h-3.5" />
                              </button>
                              <ContainerActionButtons
                                container={container}
                                logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id}
                                onAction={(action, currentContainer) => void handleAction(action, currentContainer)}
                              />
                            </div>
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
<tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], .cursor-default')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        aria-label={`Select container ${container.name}`}
                        checked={selection.selectedIds.includes(container.id)}
                        onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)}
                      />
                    </td>
                    <td className="p-3">
                      <div className="font-mono font-medium truncate max-w-[12rem] sm:max-w-[14rem] md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]">
                        <ContainerNameLink
                          containerId={container.id}
                          containerName={container.name}
                          displayName={(typeof container.name === "string" && container.name.length > 20) ? container.name.substring(0, 20) + "…" : container.name}
                        />
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[12rem]">{container.id}</div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">
                      <div
                        className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]"
                        title={container.image}
                      >
                        {(typeof container.image === "string" && container.image.length > 20) ? container.image.substring(0, 20) + "…" : container.image}
                      </div>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <StatusBadge status={container.status} />
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{container.state}</div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{container.cpuPercent != null ? `${container.cpuPercent}%` : "—"}</td>
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
                    <td className="p-3 hidden xl:table-cell">
  {container.netIO && (container.netIO.includes(",") || container.netIO.includes("/")) ? (
    <div className="flex flex-col text-[12px] font-mono leading-[1.3] text-muted-foreground w-max">
      <div className="text-blue-400 flex items-center gap-1" title="Download">
        <span className="w-3 text-center">↓</span>
        <span>{container.netIO.includes(",") ? container.netIO.split(",")[0].replace(/[↓,]/g, "").trim() : container.netIO.split("/")[0].trim()}</span>
      </div>
      <div className="text-emerald-400 flex items-center gap-1" title="Upload">
        <span className="w-3 text-center">↑</span>
        <span>{container.netIO.includes(",") ? container.netIO.split(",")[1].replace(/[↑,]/g, "").trim() : container.netIO.split("/")[1].trim()}</span>
      </div>
    </div>
  ) : (
    <div className="font-mono text-muted-foreground text-sm">{container.netIO ?? "—"}</div>
  )}
</td>
                    <td className="p-3 font-mono text-muted-foreground text-[11px] hidden lg:table-cell"><PortLinks ports={container.ports} /></td>
                    <td className="sticky right-0 z-10 bg-card p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                      <div className="flex items-center justify-end gap-1">
                              <button onClick={() => toggleMonitoring(container.id)} className={`p-1.5 rounded transition-colors hidden lg:inline-flex ${expandedMonitoring[container.id] ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"}`} title="Monitoring Options">
                                <Activity className="w-3.5 h-3.5" />
                              </button>
                              <ContainerActionButtons
                        container={container}
                        logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id}
                        onAction={(action, currentContainer) => void handleAction(action, currentContainer)}
                      />
                            </div>
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

      {logsContainer && (
        <ContainerLogs
          containerId={logsContainer.id}
          containerName={logsContainer.name}
          onClose={() => setLogsContainer(null)}
        />
      )}

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

      <RunContainerDialog
        open={runDialogOpen}
        pending={runMutation.isPending}
        onOpenChange={setRunDialogOpen}
        onRun={handleRunContainer}
      />
    </div>
  );
}
