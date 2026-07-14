import { useEffect, useMemo, useState } from "react";

/**
 * One deep module for the compose-grouped resource list shared by the
 * Containers, Images, Volumes, Networks, and Dashboard pages. It owns the
 * compose-project name heuristic, the group/flat row construction, and the
 * expand/collapse + group-selection state. Callers keep their own filtering,
 * selection, and table markup and cross this seam through `getProject`
 * (per-resource skip/label rule) and `getId` (per-resource identity).
 */

export type ResourceRowEntry<T> =
  | { type: "group"; project: string; items: T[] }
  | { type: "item"; item: T };

/**
 * Shared compose-project name heuristic. Normalizes `_`→`-`, splits on `-`,
 * drops a trailing numeric replica suffix (`web-app-1` → `web`) and then the
 * service segment. Returns null when the name is too short to carry a project.
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

/**
 * Build compose-grouped rows in original item order. A project with more than
 * one member collapses into a single group row at the position of its first
 * member; everything else stays a flat item row.
 */
export function buildResourceRowEntries<T>(
  items: T[],
  getProject: (item: T) => string | null,
): ResourceRowEntry<T>[] {
  const composeGroups = new Map<string, T[]>();

  for (const item of items) {
    const project = getProject(item);

    if (project) {
      composeGroups.set(project, [...(composeGroups.get(project) ?? []), item]);
    }
  }

  const seenGroups = new Set<string>();
  const entries: ResourceRowEntry<T>[] = [];

  for (const item of items) {
    const project = getProject(item);

    if (project && (composeGroups.get(project)?.length ?? 0) > 1) {
      if (!seenGroups.has(project)) {
        entries.push({ type: "group", project, items: composeGroups.get(project)! });
        seenGroups.add(project);
      }
      continue;
    }

    entries.push({ type: "item", item });
  }

  return entries;
}

export interface GroupSelectionState {
  allSelected: boolean;
  partiallySelected: boolean;
}

export interface UseResourceGroupsResult<T> {
  rowEntries: ResourceRowEntry<T>[];
  expandedGroups: Record<string, boolean>;
  toggleGroup: (project: string) => void;
  groupSelectionState: (items: T[]) => GroupSelectionState;
}

/**
 * React binding around the row construction: memoizes the grouped rows, keeps
 * an expand/collapse map that defaults new groups to expanded and prunes groups
 * that disappear, and derives group-level selection state from the caller's
 * current selected ids.
 *
 * `getProject` must be a stable reference (define it at module scope) — it is a
 * memoization dependency for the grouped rows.
 */
export function useResourceGroups<T>({
  items,
  getProject,
  getId,
  selectedIds,
}: {
  items: T[];
  getProject: (item: T) => string | null;
  getId: (item: T) => string;
  selectedIds: string[];
}): UseResourceGroupsResult<T> {
  const rowEntries = useMemo(() => buildResourceRowEntries(items, getProject), [items, getProject]);

  const visibleGroupIds = useMemo(
    () =>
      rowEntries
        .filter((entry): entry is Extract<ResourceRowEntry<T>, { type: "group" }> => entry.type === "group")
        .map((entry) => entry.project),
    [rowEntries],
  );

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

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

  const toggleGroup = (project: string) => setExpandedGroups((c) => ({ ...c, [project]: !c[project] }));

  const groupSelectionState = (groupItems: T[]): GroupSelectionState => {
    const selected = groupItems.filter((item) => selectedIds.includes(getId(item))).length;
    return {
      allSelected: selected === groupItems.length && groupItems.length > 0,
      partiallySelected: selected > 0 && selected < groupItems.length,
    };
  };

  return { rowEntries, expandedGroups, toggleGroup, groupSelectionState };
}
