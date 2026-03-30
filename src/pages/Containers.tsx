import { Fragment, useEffect, useMemo, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Play, Plus, RotateCcw, Search, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { ContainerLogs } from "@/components/ContainerLogs";
import { RunContainerDialog } from "@/components/RunContainerDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useContainers,
  useRemoveContainer,
  useRestartContainer,
  useRunContainer,
  useStartContainer,
  useStopContainer,
} from "@/hooks/use-containers";
import { useTableSelection } from "@/hooks/use-table-selection";
import { ContainerSummary, RunContainerPayload } from "@/lib/api/types";

type ContainerRowEntry =
  | { type: "group"; project: string; containers: ContainerSummary[] }
  | { type: "container"; container: ContainerSummary };

function inferComposeProject(container: ContainerSummary) {
  if (container.composeProject) {
    return container.composeProject;
  }

  const normalizedName = container.name.replace(/_/g, "-");
  const parts = normalizedName.split("-").filter(Boolean);

  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1) ?? "")) {
    return parts.slice(0, -2).join("-");
  }

  if (parts.length >= 2) {
    return parts.slice(0, -1).join("-");
  }

  return null;
}

export default function Containers() {
  const [filter, setFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "running">("all");
  const [logsContainer, setLogsContainer] = useState<ContainerSummary | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const containersQuery = useContainers();
  const runMutation = useRunContainer();
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const restartMutation = useRestartContainer();
  const removeMutation = useRemoveContainer();
  const containers = containersQuery.data ?? [];
  const normalizedFilter = filter.toLowerCase();
  const filtered = containers.filter((container) => {
    const matchesVisibility = visibilityFilter === "all" || container.status === "running";
    const matchesText =
      container.name.toLowerCase().includes(normalizedFilter) ||
      container.image.toLowerCase().includes(normalizedFilter);

    return matchesVisibility && matchesText;
  });
  const selection = useTableSelection(filtered.map((container) => container.id));
  const selectedContainers = containers.filter((container) => selection.selectedIds.includes(container.id));
  const hasSelection = selection.selectedCount > 0;
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const rowEntries = useMemo(() => {
    const composeGroups = new Map<string, ContainerSummary[]>();

    for (const container of filtered) {
      const project = inferComposeProject(container);

      if (project) {
        composeGroups.set(project, [...(composeGroups.get(project) ?? []), container]);
      }
    }

    const seenGroups = new Set<string>();
    const entries: ContainerRowEntry[] = [];

    for (const container of filtered) {
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
  }, [filtered]);
  const visibleGroupIds = useMemo(
    () => rowEntries.filter((entry): entry is Extract<ContainerRowEntry, { type: "group" }> => entry.type === "group").map((entry) => entry.project),
    [rowEntries],
  );

  useEffect(() => {
    setExpandedGroups((current) => {
      const next: Record<string, boolean> = {};
      let changed = false;

      for (const groupId of visibleGroupIds) {
        next[groupId] = current[groupId] ?? true;
        if (next[groupId] !== current[groupId]) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [visibleGroupIds]);

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

  const handleAction = async (action: "start" | "stop" | "restart" | "remove" | "logs" | "terminal", container: ContainerSummary) => {
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

      if (action === "remove") {
        await removeMutation.mutateAsync(container.id);
        if (logsContainer?.id === container.id) {
          setLogsContainer(null);
        }
        toast.success(`Removed ${container.name}`);
        return;
      }

      if (action === "logs") {
        setLogsContainer((current) => (current?.id === container.id ? null : container));
        return;
      }

      toast.info("Container exec terminal is not implemented yet.");
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

  const toggleGroup = (project: string) => {
    setExpandedGroups((current) => ({ ...current, [project]: !current[project] }));
  };

  const groupSelectionState = (containersInGroup: ContainerSummary[]) => {
    const selected = containersInGroup.filter((container) => selection.selectedIds.includes(container.id)).length;
    return {
      allSelected: selected === containersInGroup.length && containersInGroup.length > 0,
      partiallySelected: selected > 0 && selected < containersInGroup.length,
    };
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
            if (value === "all" || value === "running") {
              setVisibilityFilter(value);
            }
          }}
          variant="outline"
          size="sm"
          className="justify-start md:justify-end"
        >
          <ToggleGroupItem value="all" className="font-mono text-[11px] uppercase tracking-wide" aria-label="Show all containers">
            Show all
          </ToggleGroupItem>
          <ToggleGroupItem value="running" className="font-mono text-[11px] uppercase tracking-wide" aria-label="Show running containers">
            Only running
          </ToggleGroupItem>
        </ToggleGroup>
        {hasSelection && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 md:ml-auto">
            <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
              {selection.selectedCount} selected
            </span>
            <button
              type="button"
              onClick={() => void handleBulkAction("remove")}
              className="inline-flex h-9 items-center rounded-md bg-destructive px-3 font-mono text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              title="Delete selected containers"
            >
              Delete
            </button>
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
            <button
              type="button"
              onClick={() => selection.toggleAll(false)}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted"
              title="Clear selection"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[56rem] w-full text-xs">
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
                <th className="text-left p-3">Image</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">CPU</th>
                <th className="text-left p-3">Mem</th>
                <th className="text-left p-3">Ports</th>
                <th className="sticky right-0 z-20 bg-card text-right p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rowEntries.map((entry) => {
                if (entry.type === "group") {
                  const runningCount = entry.containers.filter((container) => container.status === "running").length;
                  const groupState = groupSelectionState(entry.containers);

                  return (
                    <Fragment key={`group-${entry.project}`}>
                      <tr key={`group-${entry.project}`} className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <Checkbox
                            aria-label={`Select compose stack ${entry.project}`}
                            checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false}
                            onCheckedChange={(checked) => {
                              for (const container of entry.containers) {
                                selection.toggleOne(container.id, checked === true);
                              }
                            }}
                          />
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => toggleGroup(entry.project)}
                            className="flex items-center gap-2 text-left"
                            aria-label={`${expandedGroups[entry.project] ? "Collapse" : "Expand"} compose stack ${entry.project}`}
                          >
                            {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                            <Boxes className="h-4 w-4 text-primary" />
                            <div>
                              <div className="font-mono font-medium text-foreground">{entry.project}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                Compose Stack • {entry.containers.length} containers
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">Compose Stack</td>
                        <td className="p-3">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {runningCount}/{entry.containers.length} running
                          </span>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">—</td>
                        <td className="p-3 font-mono text-muted-foreground">—</td>
                        <td className="p-3 font-mono text-muted-foreground text-[11px]">—</td>
                        <td className="sticky right-0 z-10 bg-muted/20 p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted/30" />
                      </tr>
                      {expandedGroups[entry.project] &&
                        entry.containers.map((container) => (
                          <tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <td className="p-3">
                              <Checkbox
                                aria-label={`Select container ${container.name}`}
                                checked={selection.selectedIds.includes(container.id)}
                                onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)}
                              />
                            </td>
                            <td className="p-3">
                              <div className="flex items-start gap-2 pl-6">
                                <div className="mt-1 h-2 w-2 rounded-full border border-primary/60" />
                                <div>
                                  <div
                                    className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]"
                                    title={container.name}
                                  >
                                    {container.name}
                                  </div>
                                  <div className="font-mono text-[10px] text-muted-foreground">{container.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground">
                              <div
                                className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]"
                                title={container.image}
                              >
                                {container.image}
                              </div>
                            </td>
                            <td className="p-3">
                              <StatusBadge status={container.status} />
                              <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{container.state}</div>
                            </td>
                            <td className="p-3 font-mono text-muted-foreground">{container.cpuPercent ?? "—"}</td>
                            <td className="p-3 font-mono text-muted-foreground">{container.memUsage ?? "—"}</td>
                            <td className="p-3 font-mono text-muted-foreground text-[11px]">{container.ports || "—"}</td>
                            <td className="sticky right-0 z-10 bg-card p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted/30">
                              <ContainerActionButtons
                                container={container}
                                logsActive={logsContainer?.id === container.id}
                                onAction={(action, currentContainer) => void handleAction(action, currentContainer)}
                              />
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                }

                const container = entry.container;
                return (
                  <tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        aria-label={`Select container ${container.name}`}
                        checked={selection.selectedIds.includes(container.id)}
                        onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)}
                      />
                    </td>
                    <td className="p-3">
                      <div
                        className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]"
                        title={container.name}
                      >
                        {container.name}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground">{container.id}</div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">
                      <div
                        className="max-w-[8.5rem] truncate md:max-w-[12rem] lg:max-w-[16rem] xl:max-w-[22rem]"
                        title={container.image}
                      >
                        {container.image}
                      </div>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={container.status} />
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{container.state}</div>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground">{container.cpuPercent ?? "—"}</td>
                    <td className="p-3 font-mono text-muted-foreground">{container.memUsage ?? "—"}</td>
                    <td className="p-3 font-mono text-muted-foreground text-[11px]">{container.ports || "—"}</td>
                    <td className="sticky right-0 z-10 bg-card p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted/30">
                      <ContainerActionButtons
                        container={container}
                        logsActive={logsContainer?.id === container.id}
                        onAction={(action, currentContainer) => void handleAction(action, currentContainer)}
                      />
                    </td>
                  </tr>
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

      <RunContainerDialog
        open={runDialogOpen}
        pending={runMutation.isPending}
        onOpenChange={setRunDialogOpen}
        onRun={handleRunContainer}
      />
    </div>
  );
}
