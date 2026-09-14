import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiState } from "@/components/ApiState";
import { ContainerExec } from "@/components/ContainerExec";
import type { ContainerActionButtonsAction } from "@/components/ContainerActionButtons";
import { ContainerDetailsHeader } from "@/components/container-details/ContainerDetailsHeader";
import { ContainerInspectTab } from "@/components/container-details/ContainerInspectTab";
import { ContainerOverviewTab } from "@/components/container-details/ContainerOverviewTab";
import { ContainerStatsTab } from "@/components/container-details/ContainerStatsTab";
import { ContainerLogs } from "@/components/ContainerLogs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContainerActions } from "@/hooks/use-container-actions";
import { useContainerDetails, useContainerInspect, useContainerStats } from "@/hooks/use-containers";
import { useEngineInfo } from "@/hooks/use-engine";
import type { ContainerSummary } from "@/lib/api/types";

export default function ContainerDetails() {
  const { containerId } = useParams<{ containerId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const { runAction, confirmationDialog } = useContainerActions();
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
      <div className="p-4 md:p-6">
        <ApiState title="Loading container details" description="DockLite is fetching container detail data." />
      </div>
    );
  }

  if (detailsQuery.error || inspectQuery.error || statsQuery.error) {
    return (
      <div className="p-4 md:p-6">
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
      <div className="p-4 md:p-6">
        <ApiState title="Container not found" description="DockLite could not resolve that container on the selected engine." />
      </div>
    );
  }

  const handleAction = async (action: ContainerActionButtonsAction, container: ContainerSummary) => {
    // This page already has Logs and Terminal panes, so those two buttons open
    // the matching tab rather than a floating pane like the tables use.
    if (action === "logs" || action === "terminal") {
      setActiveTab(action);
      return;
    }

    // runAction confirms remove and rebuild; start, stop and restart go straight
    // through, and it reports whether the mutation actually landed.
    if (!(await runAction(action, container))) {
      return;
    }

    if (action === "remove") {
      // The container this route describes is gone. Staying here would show
      // "Container not found", so go back to the list the way the header does.
      navigate("/containers");
      return;
    }

    // Everything else is handled by the mutation's own cache invalidation.
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <ContainerDetailsHeader container={details.summary} endpoint={engineQuery.data?.endpoint ?? "unknown"} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="h-auto flex-nowrap justify-start gap-1 bg-card p-1 overflow-x-auto w-full max-w-full">
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
          <ContainerOverviewTab
            details={details}
            onAction={(action, container) => void handleAction(action, container)}
          />
        </TabsContent>
        <TabsContent value="logs" className="mt-0">
          <ContainerLogs containerId={details.summary.id} containerName={details.summary.name} onClose={() => {}} />
        </TabsContent>
        <TabsContent value="terminal" className="mt-0">
          <div className="h-[32rem] overflow-hidden rounded-md border border-border bg-card">
            <ContainerExec containerId={details.summary.id} containerName={details.summary.name} onClose={() => {}} />
          </div>
        </TabsContent>
        <TabsContent value="inspect" className="mt-0">
          <ContainerInspectTab inspect={inspectQuery.data ?? details.inspect} />
        </TabsContent>
        <TabsContent value="stats" className="mt-0">
          <ContainerStatsTab summary={details.summary} stats={statsQuery.data ?? details.stats} />
        </TabsContent>
      </Tabs>

      {confirmationDialog}
    </div>
  );
}
