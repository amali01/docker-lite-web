import { useParams } from "react-router-dom";
import { ApiState } from "@/components/ApiState";
import { useContainerDetails, useContainerInspect, useContainerStats } from "@/hooks/use-containers";

export default function ContainerDetails() {
  const { containerId } = useParams<{ containerId: string }>();
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

  return (
    <div className="p-6">
      <ApiState
        title="Container details"
        description="The container detail shell is not implemented yet."
      />
    </div>
  );
}
