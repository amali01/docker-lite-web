/**
 * Where a published container port actually lives, from the browser's point of
 * view.
 *
 * Docker reports a published port as `0.0.0.0:8080->80/tcp`, and both halves of
 * that are written from the *engine's* perspective: for an ssh or tcp/TLS
 * target the port is listening on the remote machine, not on the machine
 * running this browser. Everything here returns `null` rather than guessing —
 * a link that opens the wrong host is worse than plain text.
 */

const WILDCARD_BINDS = new Set(["", "0.0.0.0", "::", "[::]"]);
const LOOPBACK_BINDS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

/**
 * The browsable host behind an engine endpoint (`unix:///var/run/docker.sock`,
 * `ssh://user@host`, `tcp://host:2376`), or `null` when there is nothing
 * browsable to derive.
 */
export function engineHostFromEndpoint(endpoint: string | null | undefined): string | null {
  if (!endpoint) {
    return null;
  }

  // A socket-backed engine is this machine; the socket path is not a host.
  if (endpoint.startsWith("unix://") || endpoint.startsWith("npipe://")) {
    return "localhost";
  }

  try {
    // `hostname` keeps the brackets an IPv6 literal needs inside a URL.
    return new URL(endpoint).hostname || null;
  } catch {
    return null;
  }
}

/**
 * An `http://` href for one entry of a container's port string, or `null` when
 * the port is not published, the binding is not reachable from here, or the
 * engine host is unknown.
 */
export function publishedPortHref(portMapping: string, engineHost: string | null): string | null {
  const [hostSide, containerSide] = portMapping.split("->");

  if (containerSide === undefined) {
    return null;
  }

  // Greedy up to the last colon so a bracketed IPv6 bind stays intact.
  const match = hostSide.trim().match(/^(.*):(\d+)$/);

  if (!match) {
    return null;
  }

  const [, bind, port] = match;

  if (WILDCARD_BINDS.has(bind)) {
    return engineHost ? `http://${engineHost}:${port}` : null;
  }

  // A loopback binding only exists on the engine's own machine.
  if (LOOPBACK_BINDS.has(bind)) {
    return engineHost && LOOPBACK_BINDS.has(engineHost) ? `http://${bind}:${port}` : null;
  }

  return `http://${bind}:${port}`;
}
