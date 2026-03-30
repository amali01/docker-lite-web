import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { ContainerLogs } from "@/components/ContainerLogs";
import { RunContainerDialog } from "@/components/RunContainerDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
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
import { ContainerSummary, RunContainerPayload } from "@/lib/api/types";

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

  const containers = containersQuery.data ?? [];
  const normalizedFilter = filter.toLowerCase();
  const filtered = containers.filter((container) => {
    const matchesVisibility = visibilityFilter === "all" || container.status === "running";
    const matchesText =
      container.name.toLowerCase().includes(normalizedFilter) ||
      container.image.toLowerCase().includes(normalizedFilter);

    return matchesVisibility && matchesText;
  });

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
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[56rem] w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
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
              {filtered.map((container) => (
                <tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
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
              ))}
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
