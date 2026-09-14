import { Link } from "react-router-dom";

/** The container name cell, linking through to the container detail route. */
export function ContainerNameLink({
  containerId,
  containerName,
  displayName,
}: {
  containerId: string;
  containerName: string;
  displayName: string;
}) {
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
