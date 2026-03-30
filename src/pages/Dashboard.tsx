import { useState } from "react";
import { Box, HardDrive, Image, Network, Server } from "lucide-react";
import { ApiState } from "@/components/ApiState";
import { ContainerActionButtons } from "@/components/ContainerActionButtons";
import { ContainerLogs } from "@/components/ContainerLogs";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
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
import { useVolumes } from "@/hooks/use-volumes";
import { ContainerSummary } from "@/lib/api/types";

function formatMetric(value: string | number | null) {
  if (value == null || value === "") {
    return "—";
  }

  return value;
}

export default function Dashboard() {
  const [logsContainer, setLogsContainer] = useState<ContainerSummary | null>(null);
  const engineQuery = useEngineInfo();
  const containersQuery = useContainers();
  const startMutation = useStartContainer();
  const stopMutation = useStopContainer();
  const restartMutation = useRestartContainer();
  const removeMutation = useRemoveContainer();
  const imagesQuery = useImages();
  const volumesQuery = useVolumes();
  const networksQuery = useNetworks();

  if ([engineQuery, containersQuery, imagesQuery, volumesQuery, networksQuery].some((query) => query.isLoading)) {
    return (
      <div className="p-6">
        <ApiState title="Loading dashboard" description="DockLite is fetching engine and resource data." />
      </div>
    );
  }

  if (engineQuery.error || containersQuery.error || imagesQuery.error || volumesQuery.error || networksQuery.error) {
    return (
      <div className="p-6">
        <ApiState
          title="Docker connection unavailable"
          description="The local DockLite backend is not reachable or Docker is unavailable. Open Settings to test the configured API endpoint."
        />
      </div>
    );
  }

  const engine = engineQuery.data!;
  const containers = containersQuery.data!;
  const images = imagesQuery.data!;
  const volumes = volumesQuery.data!;
  const networks = networksQuery.data!;
  const running = containers.filter((container) => container.status === "running").length;
  const stopped = containers.filter((container) => container.status === "stopped").length;

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Docker Engine v{engine.dockerVersion} • API v{engine.apiVersion}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Containers" value={containers.length} icon={Box} subtitle={`${running} running, ${stopped} stopped`} accent />
        <StatCard label="Images" value={images.length} icon={Image} subtitle="Local image cache" />
        <StatCard label="Volumes" value={volumes.length} icon={HardDrive} subtitle="Persistent data volumes" />
        <StatCard label="Networks" value={networks.length} icon={Network} subtitle={`${networks.filter((network) => network.containers > 0).length} active`} />
      </div>

      <div className="bg-card border border-border rounded-md p-4">
        <h2 className="text-sm font-mono font-semibold mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          System Information
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-muted-foreground block">OS / Arch</span>
            <span className="text-foreground">{engine.os} / {engine.arch}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Kernel</span>
            <span className="text-foreground">{engine.kernelVersion}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">CPUs</span>
            <span className="text-foreground">{engine.cpus} cores</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Memory</span>
            <span className="text-foreground">{engine.totalMemory}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Storage Driver</span>
            <span className="text-foreground">{engine.storageDriver}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Docker Root</span>
            <span className="text-foreground">{engine.rootDir}</span>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-mono font-semibold flex items-center gap-2">
            <Box className="w-4 h-4 text-primary" />
            Containers
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Image</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">CPU</th>
                <th className="text-left p-3">Memory</th>
                <th className="text-left p-3">Ports</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((container) => (
                <tr key={container.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono font-medium text-foreground">{container.name}</td>
                  <td className="p-3 font-mono text-muted-foreground">{container.image}</td>
                  <td className="p-3"><StatusBadge status={container.status} /></td>
                  <td className="p-3 font-mono text-muted-foreground">{formatMetric(container.cpuPercent)}</td>
                  <td className="p-3 font-mono text-muted-foreground">{formatMetric(container.memUsage)}</td>
                  <td className="p-3 font-mono text-muted-foreground text-[11px]">{container.ports || "—"}</td>
                  <td className="p-3">
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
    </div>
  );
}
