import { useEngineInfo } from "@/hooks/use-engine";
import { engineHostFromEndpoint, publishedPortHref } from "@/lib/port-links";

/**
 * A container's port column. Each published port becomes a link to wherever it
 * is actually reachable (see `@/lib/port-links`); anything unpublished, or
 * published somewhere this browser cannot reach, stays plain text.
 */
export function PortLinks({ ports }: { ports: string | null | undefined }) {
  const engineQuery = useEngineInfo();
  const engineHost = engineHostFromEndpoint(engineQuery.data?.endpoint);

  if (!ports || ports === "—") {
    return <span>—</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {ports.split(", ").map((part, index) => {
        const href = publishedPortHref(part, engineHost);

        if (!href) {
          return <span key={index}>{part}</span>;
        }

        return (
          <a
            key={index}
            href={href}
            target="_blank"
            rel="noreferrer"
            title={href}
            className="text-primary hover:underline hover:text-primary/80"
          >
            {part}
          </a>
        );
      })}
    </div>
  );
}
