import { ApiState } from "@/components/ApiState";
import { ContainerDetailsHeader } from "@/components/container-details/ContainerDetailsHeader";
import { ContainerOverviewTab } from "@/components/container-details/ContainerOverviewTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContainerDetails, useContainerInspect, useContainerStats } from "@/hooks/use-containers";
import { useEngineInfo } from "@/hooks/use-engine";
import { useParams } from "react-router-dom";

export default function ContainerDetails() {
  const { containerId } = useParams<{ containerId: string }>();
  const engineQuery = useEngineInfo();
  const detailsQuery = useContainerDetails(containerId);
  const inspectQuery = useContainerInspect(containerId);
  const statsQuery = useContainerStats(containerId);

  const isLoading =
    detailsQuery.isLoading ||
    detailsQuery.isPending ||
    inspectQuery.isLoading ||
    inspectQuery.isPending ||
    statsQuery.isLoading ||
    statsQuery.isPending;

  if (isLoading) {
    return (
      <div className="p-6">
        <ApiState title="Loading container details" description="DockLite is fetching container detail data." />
      </div>
    );
  }

  if (detailsQuery.error || inspectQuery.error || statsQuery.error) {
    return (
      <div className="p-6">
        <ApiState
          title="Unable to load container details"
          description="DockLite could not fetch container detail data from the selected engine."
        />
      </div>
    );
  }

  const details = detailsQuery.data;

  if (!details) {
    return (
      <div className="p-6">
        <ApiState title="Container not found" description="DockLite could not resolve that container on the selected engine." />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <ContainerDetailsHeader container={details.summary} endpoint={engineQuery.data?.endpoint ?? "unknown"} />

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 bg-card p-1">
          <TabsTrigger value="overview" className="font-mono text-xs">
            Overview
          </TabsTrigger>
          <TabsTrigger value="logs" className="font-mono text-xs">
            Logs
          </TabsTrigger>
          <TabsTrigger value="terminal" className="font-mono text-xs">
            Terminal
          </TabsTrigger>
          <TabsTrigger value="inspect" className="font-mono text-xs">
            Inspect
          </TabsTrigger>
          <TabsTrigger value="stats" className="font-mono text-xs">
            Stats
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <ContainerOverviewTab details={details} />
        </TabsContent>
        <TabsContent value="logs" className="mt-0">
          <ApiState title="Logs tab pending" description="Streaming logs will be embedded here in the next task." />
        </TabsContent>
        <TabsContent value="terminal" className="mt-0">
          <ApiState title="Terminal tab pending" description="Interactive exec access will be embedded here in the next task." />
        </TabsContent>
        <TabsContent value="inspect" className="mt-0">
          <ApiState title="Inspect tab pending" description="Formatted inspect data will be rendered here in the next task." />
        </TabsContent>
        <TabsContent value="stats" className="mt-0">
          <ApiState title="Stats tab pending" description="Detailed runtime metrics will be rendered here in the next task." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
