import { Fragment, useEffect, useMemo, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Network, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useCreateNetwork, useNetworks, useRemoveNetwork } from "@/hooks/use-networks";
import { NetworkSummary } from "@/lib/api/types";

type NetworkRowEntry =
  | { type: "group"; project: string; networks: NetworkSummary[] }
  | { type: "network"; network: NetworkSummary };

function inferComposeProject(network: NetworkSummary) {
  const defaultNetworks = ["bridge", "host", "none"];
  if (defaultNetworks.includes(network.name)) return null;

  const normalizedName = network.name.replace(/_/g, "-");
  const parts = normalizedName.split("-").filter(Boolean);

  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1) ?? "")) {
    return parts.slice(0, -2).join("-");
  }

  if (parts.length >= 2) {
    return parts.slice(0, -1).join("-");
  }

  return null;
}

export default function Networks() {
  const [filter, setFilter] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const networksQuery = useNetworks();
  const createMutation = useCreateNetwork();
  const removeMutation = useRemoveNetwork();
  const defaultNetworks = ["bridge", "host", "none"];

  const networks = networksQuery.data ?? [];
  const filtered = networks.filter((network) => network.name.toLowerCase().includes(filter.toLowerCase()));
  const selection = useTableSelection(filtered.map((network) => network.id));

  const selectedNetworks = networks.filter((network) => selection.selectedIds.includes(network.id));
  const hasSelection = selection.selectedCount > 0;

  const rowEntries = useMemo(() => {
    const composeGroups = new Map<string, NetworkSummary[]>();

    for (const network of filtered) {
      const project = inferComposeProject(network);

      if (project) {
        composeGroups.set(project, [...(composeGroups.get(project) ?? []), network]);
      }
    }

    const seenGroups = new Set<string>();
    const entries: NetworkRowEntry[] = [];

    for (const network of filtered) {
      const project = inferComposeProject(network);

      if (project && (composeGroups.get(project)?.length ?? 0) > 1) {
        if (!seenGroups.has(project)) {
          entries.push({ type: "group", project, networks: composeGroups.get(project)! });
          seenGroups.add(project);
        }
        continue;
      }

      entries.push({ type: "network", network });
    }

    return entries;
  }, [filtered]);

  const visibleGroupIds = useMemo(
    () => rowEntries.filter((entry): entry is Extract<NetworkRowEntry, { type: "group" }> => entry.type === "group").map((entry) => entry.project),
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

  if (networksQuery.isLoading) {
    return (
      <div className="p-6">
        <ApiState title="Loading networks" description="DockLite is fetching Docker networks." />
      </div>
    );
  }

  if (networksQuery.error) {
    return (
      <div className="p-6">
        <ApiState title="Unable to load networks" description="The backend could not list Docker networks." />
      </div>
    );
  }

  const handleBulkAction = async (action: "remove") => {
    if (selectedNetworks.length === 0) return;
    try {
      for (const network of selectedNetworks) {
        if (!defaultNetworks.includes(network.name)) {
          await removeMutation.mutateAsync(network.id);
        }
      }
      selection.toggleAll(false);
      toast.success(`Removed selected networks`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    }
  };

  const handleGroupAction = async (action: "remove", project: string, items: NetworkSummary[]) => {
    try {
      for (const item of items) {
        if (!defaultNetworks.includes(item.name)) {
          await removeMutation.mutateAsync(item.id);
        }
      }
      toast.success(`Removed networks for ${project}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Group action failed");
    }
  };

  const toggleGroup = (project: string) => setExpandedGroups((c) => ({ ...c, [project]: !c[project] }));

  const groupSelectionState = (items: NetworkSummary[]) => {
    const selected = items.filter((item) => selection.selectedIds.includes(item.id)).length;
    return {
      allSelected: selected === items.length && items.length > 0,
      partiallySelected: selected > 0 && selected < items.length,
    };
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Networks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{networks.length} networks</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs w-full sm:w-auto" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Create Network
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter networks..." value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
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

      <div className="bg-card border border-border rounded-md overflow-hidden overflow-x-auto">
        <table className="min-w-[48rem] w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="w-10 p-3">
                <Checkbox aria-label="Select all" checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => selection.toggleAll(checked === true)} />
              </th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Driver</th>
              <th className="text-left p-3">Scope</th>
              <th className="text-left p-3">Subnet</th>
              <th className="text-left p-3">Gateway</th>
              <th className="text-left p-3">Containers</th>
              <th className="text-right p-3 sticky right-0 bg-card z-20 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rowEntries.map((entry) => {
              if (entry.type === "group") {
                const groupState = groupSelectionState(entry.networks);
                return (
                  <Fragment key={`group-${entry.project}`}>
                    <tr className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Checkbox checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => { entry.networks.forEach((n) => selection.toggleOne(n.id, checked === true)); }} />
                      </td>
                      <td className="p-3">
                        <button onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left">
                          {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                          <Boxes className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-mono font-medium text-foreground">{entry.project}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">Compose Stack • {entry.networks.length} networks</div>
                          </div>
                        </button>
                      </td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 text-muted-foreground">—</td>
                      <td className="p-3 sticky right-0 bg-muted/20 z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted/30 transition-colors">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => void handleGroupAction("remove", entry.project, entry.networks)} className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10" title="Delete stack networks">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedGroups[entry.project] && entry.networks.map((network) => (
                      <tr key={network.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3"><Checkbox checked={selection.selectedIds.includes(network.id)} onCheckedChange={(checked) => selection.toggleOne(network.id, checked === true)} /></td>
                        <td className="p-3 font-mono text-foreground flex items-center gap-2 pl-8">
                          <Network className="w-3.5 h-3.5 text-primary" /> {network.name}
                          {defaultNetworks.includes(network.name) && <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground uppercase">default</span>}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">{network.driver}</td>
                        <td className="p-3 font-mono text-muted-foreground">{network.scope}</td>
                        <td className="p-3 font-mono text-muted-foreground">{network.subnet || "—"}</td>
                        <td className="p-3 font-mono text-muted-foreground">{network.gateway || "—"}</td>
                        <td className="p-3 font-mono text-muted-foreground">{network.containers}</td>
                        <td className="p-3 sticky right-0 bg-card z-20 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted/30">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100">
                            <button onClick={async () => { try { await removeMutation.mutateAsync(network.id); toast.success(`Removed ${network.name}`); } catch (e) { toast.error("Error removing network"); } }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30" disabled={defaultNetworks.includes(network.name)}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              }
              const network = entry.network;
              return (
                <tr key={network.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                  <td className="p-3"><Checkbox checked={selection.selectedIds.includes(network.id)} onCheckedChange={(checked) => selection.toggleOne(network.id, checked === true)} /></td>
                  <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2">
                    <Network className="w-3.5 h-3.5 text-primary" />{network.name}
                    {defaultNetworks.includes(network.name) && <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground uppercase">default</span>}
                  </td>
                  <td className="p-3 font-mono text-muted-foreground">{network.driver}</td>
                  <td className="p-3 font-mono text-muted-foreground">{network.scope}</td>
                  <td className="p-3 font-mono text-muted-foreground">{network.subnet || "—"}</td>
                  <td className="p-3 font-mono text-muted-foreground">{network.gateway || "—"}</td>
                  <td className="p-3 font-mono text-muted-foreground">{network.containers}</td>
                  <td className="p-3 sticky right-0 bg-card z-20 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted/30">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={async () => { try { await removeMutation.mutateAsync(network.id); toast.success(`Removed ${network.name}`); } catch (e) { toast.error("Error removing network"); } }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30" disabled={defaultNetworks.includes(network.name)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PromptDialog open={createDialogOpen} title="Create Network" label="Network name" placeholder="e.g. app-network" confirmLabel="Create Network" pending={createMutation.isPending} onOpenChange={setCreateDialogOpen} onSubmit={async (value) => { try { const network = await createMutation.mutateAsync({ name: value }); toast.success(`Created ${network.name}`); } catch (e) { toast.error("Unable to create network"); throw e; } }} />
    </div>
  );
}
