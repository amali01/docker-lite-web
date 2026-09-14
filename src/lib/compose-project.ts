/**
 * Shared compose-project name heuristic, imported across the client/server
 * trust boundary (see `server/src/auth/middleware.ts` for the established
 * pattern of a server module importing from `src/lib`).
 *
 * This is a DISPLAY-ONLY heuristic: it groups resources whose names share a
 * prefix even when they carry no `com.docker.compose.project` label. It must
 * never be the sole basis for a destructive action — see
 * `server/src/docker/client.ts`'s `applyComposeProjectAction`, which matches
 * `remove` on the compose label alone for exactly this reason.
 */

/**
 * Normalizes `_`→`-`, splits on `-`, drops a trailing numeric replica suffix
 * (`web-app-1` → `web`) and then the service segment. Returns null when the
 * name is too short to carry a project.
 */
export function inferComposeProjectFromName(name: string): string | null {
  const normalizedName = name.replace(/_/g, "-");
  const parts = normalizedName.split("-").filter(Boolean);

  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1) ?? "")) {
    return parts.slice(0, -2).join("-");
  }

  if (parts.length >= 2) {
    return parts.slice(0, -1).join("-");
  }

  return null;
}
