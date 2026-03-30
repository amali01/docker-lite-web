import { Fragment, useEffect, useMemo, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, HardDrive, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useCreateVolume, useRemoveVolume, useVolumes } from "@/hooks/use-volumes";
import { VolumeSummary } from "@/lib/api/types";

type VolumeRowEntry =
  | { type: "group"; project: string; volumes: VolumeSummary[] }
  | { type: "volume"; volume: VolumeSummary };

function inferComposeProject(volume: VolumeSummary) {
  const normalizedName = volume.name.replace(/_/g, "-");
  const parts = normalizedName.split("-").filter(Boolean);

  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1) ?? "")) {
    return parts.slice(0, -2).join("-");
  }

  if (parts.length >= 2) {
    return parts.slice(0, -1).join("-");
  }

  return null;
}

export default function Volumes() {
  const [filter, setFilter] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const volumesQuery = useVolumes();
  const createMutation = useCreateVolume();
  const removeMutation = useRemoveVolume();

  const volumes = volumesQuery.data ?? [];
  const filtered = volumes.filter((volume) => volume.name.toLowerCase().includes(filter.toLowerCase()));
  const selection = useTableSelection(filtered.map((volume) => volume.name));

  const selectedVolumes = volumes.filter((volume) => selection.selectedIds.includes(volume.name));
  const hasSelection = selection.selectedCount > 0;

  const rowEntries = useMemo(() => {
    const composeGroups = new Map<string, VolumeSummary[]>();

    for (const volume of filtered) {
      const project = inferComposeProject(volume);

      if (project) {
        composeGroups.set(project, [...(composeGroups.get(project) ?? []), volume]);
      }
    }

    const seenGroups = new Set<string>();
    const entries: VolumeRowEntry[] = [];

    for (const volume of filtered) {
      const project = inferComposeProject(volume);

      if (project && (composeGroups.get(project)?.length ?? 0) > 1) {
        if (!seenGroups.has(project)) {
          entries.push({ type: "group", project, volumes: composeGroups.get(project)! });
          seenGroups.add(project);
        }
        continue;
      }

      entries.push({ type: "volume", volume });
    }

    return entries;
  }, [filtered]);

  const visibleGroupIds = useMemo(
    () => rowEntries.filter((entry): entry is Extract<VolumeRowEntry, { type: "group" }> => entry.type === "group").map((entry) => entry.project),
    [rowEntries],
  );

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

  if (volumesQuery.isLoading) {
    return (
      <div className="p-6">
        <ApiState title="Loading volumes" description="DockLite is fetching Docker volumes." />
      </div>
    );
  }

  if (volumesQuery.error) {
    return (
      <div className="p-6">
        <ApiState title="Unable to load volumes" description="The backend could not list Docker volumes." />
      </div>
    );
  }

  const handleBulkAction = async (action: "remove") => {
    if (selectedVolumes.length === 0) return;
    try {
      for (const volume of selectedVolumes) {
        await removeMutation.mutateAsync(volume.name);
      }
      selection.toggleAll(false);
      toast.success(`Removed ${selectedVolumes.length} volumes`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    }
  };

  const handleGroupAction = async (action: "remove", project: string, items: VolumeSummary[]) => {
    try {
      for (const item of items) {
        if (!item.inUse) {
          await removeMutation.mutateAsync(item.name);
        }
      }
      toast.success(`Removed unused volumes for ${project}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Group action failed");
    }
  };

  const toggleGroup = (project: string) => setExpandedGroups((c) => ({ ...c, [project]: !c[project] }));

  const groupSelectionState = (items: VolumeSummary[]) => {
    const selected = items.filter((item) => selection.selectedIds.includes(item.name)).length;
    return {
      allSelected: selected === items.length && items.length > 0,
      partiallySelected: selected > 0 && selected < items.length,
    };
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Volumes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{volumes.length} volumes</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs w-full sm:w-auto" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Create Volume
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter volumes..." value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
        </div>
        {hasSelection && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 h-9 py-0 md:ml-auto">
            <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
              {selection.selectedCount} selected
            </span>
            <button type="button" onClick={() => void handleBulkAction("remove")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="w-10 p-3">
                <Checkbox aria-label="Select all" checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => selection.toggleAll(checked === true)} />
              </th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Driver</th>
              <th className="text-left p-3">Mount Point</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">In Use</th>
              <th className="text-right p-3 sticky right-0 bg-card z-20 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rowEntries.map((entry) => {
              if (entry.type === "group") {
                const groupState = groupSelectionState(entry.volumes);
                return (
                  <Fragment key={`group-${entry.project}`}>
                    <tr onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"], .cursor-default')) toggleGroup(entry.project); }} className="cursor-pointer group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Checkbox checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => { entry.volumes.forEach((v) => selection.toggleOne(v.name, checked === true)); }} />
                      </td>
                      <td className="p-3 relative">
                        {expandedGroups[entry.project] && (
                          <div className="absolute left-[20px] top-1/2 -bottom-[1px] w-px bg-primary/50 z-0" />
                        )}
                        <button type="button" onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left relative z-10">
                          {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                          <Boxes className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-mono font-medium text-foreground">{entry.project}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">Compose Stack • {entry.volumes.length} volumes</div>
                          </div>
                        </button>
                      </td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 sticky right-0 bg-muted z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted transition-colors">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => void handleGroupAction("remove", entry.project, entry.volumes)} className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10" title="Delete unused stack volumes">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedGroups[entry.project] && entry.volumes.map((volume, index, arr) => (
                      <tr key={volume.name} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3"><Checkbox checked={selection.selectedIds.includes(volume.name)} onCheckedChange={(checked) => selection.toggleOne(volume.name, checked === true)} /></td>
                        <td className="p-3 relative">
                          <div className="absolute left-[20px] top-0 bottom-1/2 w-px bg-primary/50 z-0" />
                          {index !== arr.length - 1 && (
                            <div className="absolute left-[20px] top-1/2 -bottom-[1px] w-px bg-primary/50 z-0" />
                          )}
                          <div className="absolute left-[20px] top-1/2 w-[20px] h-px bg-primary/50 z-0" />
                          <div className="flex items-center gap-2 pl-6 relative z-10">
                            <div className="h-2 w-2 rounded-full border border-primary/60 bg-background shrink-0" />
                            <div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={volume.name}>{volume.name}</div>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">{volume.driver}</td>
                        <td className="p-3 font-mono text-muted-foreground text-[11px] max-w-[200px] truncate" title={volume.mountpoint}>{volume.mountpoint}</td>
                        <td className="p-3 font-mono text-muted-foreground">{volume.size}</td>
                        <td className="p-3"><span className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${volume.inUse ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{volume.inUse ? "Yes" : "No"}</span></td>
                        <td className="p-3 sticky right-0 bg-card z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={async () => { try { await removeMutation.mutateAsync(volume.name); toast.success(`Removed ${volume.name}`); } catch (e) { toast.error("Error removing volume"); } }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30" disabled={volume.inUse}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              }
              const volume = entry.volume;
              return (
                <tr key={volume.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                  <td className="p-3"><Checkbox checked={selection.selectedIds.includes(volume.name)} onCheckedChange={(checked) => selection.toggleOne(volume.name, checked === true)} /></td>
                  <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2"><HardDrive className="w-3.5 h-3.5 text-primary" />{volume.name}</td>
                  <td className="p-3 font-mono text-muted-foreground">{volume.driver}</td>
                  <td className="p-3 font-mono text-muted-foreground text-[11px] max-w-[200px] truncate">{volume.mountpoint}</td>
                  <td className="p-3 font-mono text-muted-foreground">{volume.size}</td>
                  <td className="p-3"><span className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${volume.inUse ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{volume.inUse ? "Yes" : "No"}</span></td>
                  <td className="p-3 sticky right-0 bg-card z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={async () => { try { await removeMutation.mutateAsync(volume.name); toast.success(`Removed ${volume.name}`); } catch (e) { toast.error("Error removing volume"); } }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30" disabled={volume.inUse}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <PromptDialog open={createDialogOpen} title="Create Volume" label="Volume name" placeholder="e.g. postgres-data" confirmLabel="Create Volume" pending={createMutation.isPending} onOpenChange={setCreateDialogOpen} onSubmit={async (value) => { try { const volume = await createMutation.mutateAsync({ name: value }); toast.success(`Created ${volume.name}`); } catch (e) { toast.error("Unable to create volume"); throw e; } }} />
    </div>
  );
}
