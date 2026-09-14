import { Fragment, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Network, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { destructiveActionLabel } from "@/components/ConfirmDestructiveDialog";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useConfirmDestructive } from "@/hooks/use-confirm-destructive";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useCreateNetwork, useNetworks, useRemoveNetwork } from "@/hooks/use-networks";
import { runBulkAction } from "@/lib/bulk-action";
import { NetworkSummary } from "@/lib/api/types";
import { inferComposeProjectFromName, useResourceGroups } from "@/lib/resource-groups";

const DEFAULT_NETWORKS = ["bridge", "host", "none"];

const projectOf = (network: NetworkSummary) =>
  DEFAULT_NETWORKS.includes(network.name) ? null : inferComposeProjectFromName(network.name);

export default function Networks() {
  const [filter, setFilter] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const networksQuery = useNetworks();
  const createMutation = useCreateNetwork();
  const removeMutation = useRemoveNetwork();
  const { confirm, confirmationDialog } = useConfirmDestructive();
  const defaultNetworks = DEFAULT_NETWORKS;

  const networks = networksQuery.data ?? [];
  const filtered = networks.filter((network) => network.name.toLowerCase().includes(filter.toLowerCase()));
  const selection = useTableSelection(filtered.map((network) => network.id));

  const selectedNetworks = networks.filter((network) => selection.selectedIds.includes(network.id));
  const hasSelection = selection.selectedCount > 0;

  const { rowEntries, expandedGroups, toggleGroup, groupSelectionState } = useResourceGroups({
    items: filtered,
    getProject: projectOf,
    getId: (network) => network.id,
    selectedIds: selection.selectedIds,
  });

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

  const confirmNetworkRemoval = (targets: NetworkSummary[], { title, description }: { title: string; description: string }) =>
    confirm({
      title,
      description,
      items: targets.map((network) => network.name),
      // The subnet, gateway and driver options only exist on the engine, so a
      // removed network cannot be put back the way it was from DockLite.
      consequence:
        targets.length === 1
          ? "Containers attached to it lose the network, and its subnet and driver options are not stored anywhere — recreating it means configuring it again."
          : "Containers attached to them lose the network, and their subnets and driver options are not stored anywhere — recreating them means configuring them again.",
      confirmLabel: destructiveActionLabel("Delete", targets.length, "network"),
    });

  const handleRemove = async (network: NetworkSummary) => {
    const confirmed = await confirmNetworkRemoval([network], {
      title: "Delete network?",
      description: "DockLite will delete this network from the engine.",
    });

    if (!confirmed) return;

    try {
      await removeMutation.mutateAsync(network.id);
      toast.success(`Removed ${network.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to remove network");
    }
  };

  // Docker's built-in networks cannot be removed, so they never enter a batch —
  // and the confirmation must count what will actually go, not what was ticked.
  const removable = (items: NetworkSummary[]) => items.filter((network) => !defaultNetworks.includes(network.name));

  const removeNetworks = (items: NetworkSummary[], project?: string) =>
    runBulkAction(removable(items), (network) => removeMutation.mutateAsync(network.id), {
      verb: "Removed",
      noun: "network",
      ...(project ? { context: project } : {}),
    });

  const handleBulkAction = async () => {
    const targets = removable(selectedNetworks);

    if (targets.length === 0) return;

    const confirmed = await confirmNetworkRemoval(targets, {
      title: `${destructiveActionLabel("Delete", targets.length, "network")}?`,
      description: `DockLite will delete ${targets.length === 1 ? "this network" : "these networks"} from the engine. Docker's built-in networks are left alone.`,
    });

    if (!confirmed) return;

    await removeNetworks(targets);
    selection.toggleAll(false);
  };

  const handleGroupAction = async (project: string, items: NetworkSummary[]) => {
    const targets = removable(items);

    if (targets.length === 0) return;

    const confirmed = await confirmNetworkRemoval(targets, {
      title: `${destructiveActionLabel("Delete", targets.length, "network")}?`,
      description: `DockLite will delete every network created for ${project}.`,
    });

    if (!confirmed) return;

    await removeNetworks(targets, project);
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
            <button type="button" onClick={() => void handleBulkAction()} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs lg:min-w-[48rem]">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="w-10 p-3">
                <Checkbox aria-label="Select all" checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => selection.toggleAll(checked === true)} />
              </th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3 hidden sm:table-cell">Driver</th>
              <th className="text-left p-3 hidden md:table-cell">Scope</th>
              <th className="text-left p-3 hidden lg:table-cell">Subnet</th>
              <th className="text-left p-3 hidden lg:table-cell">Gateway</th>
              <th className="text-left p-3 hidden md:table-cell">Containers</th>
              <th className="text-right p-3 sticky right-0 bg-card z-20 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center font-mono text-muted-foreground">
                  {filter ? `No networks match "${filter}".` : "No networks yet — created networks will show up here."}
                </td>
              </tr>
            )}
            {rowEntries.map((entry) => {
              if (entry.type === "group") {
                const groupState = groupSelectionState(entry.items);
                return (
                  <Fragment key={`group-${entry.project}`}>
                    <tr className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Checkbox checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => { entry.items.forEach((n) => selection.toggleOne(n.id, checked === true)); }} />
                      </td>
                      <td className="p-3">
                        <button onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left">
                          {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                          <Boxes className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-mono font-medium text-foreground">{entry.project}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">Compose Stack • {entry.items.length} networks</div>
                          </div>
                        </button>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">—</td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">—</td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">—</td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">—</td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">—</td>
                      <td className="p-3 sticky right-0 bg-muted z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted transition-colors">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => void handleGroupAction(entry.project, entry.items)} className="rounded p-2 text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Delete stack networks">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedGroups[entry.project] && entry.items.map((network) => (
                      <tr key={network.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3"><Checkbox checked={selection.selectedIds.includes(network.id)} onCheckedChange={(checked) => selection.toggleOne(network.id, checked === true)} /></td>
                        <td className="p-3 font-mono text-foreground pl-8">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Network className="w-3.5 h-3.5 text-primary shrink-0" /> <span>{network.name}</span>
                            {defaultNetworks.includes(network.name) && <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground uppercase">default</span>}
                            <span className="sm:hidden text-[10px] text-muted-foreground font-mono">{network.driver}</span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-muted-foreground hidden sm:table-cell">{network.driver}</td>
                        <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">{network.scope}</td>
                        <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{network.subnet || "—"}</td>
                        <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{network.gateway || "—"}</td>
                        <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">{network.containers}</td>
                        <td className="p-3 sticky right-0 bg-card z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => void handleRemove(network)} className="p-2 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={defaultNetworks.includes(network.name)}><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              }
              const network = entry.item;
              return (
                <tr key={network.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                  <td className="p-3"><Checkbox checked={selection.selectedIds.includes(network.id)} onCheckedChange={(checked) => selection.toggleOne(network.id, checked === true)} /></td>
                  <td className="p-3 font-mono font-medium text-foreground">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Network className="w-3.5 h-3.5 text-primary shrink-0" /><span>{network.name}</span>
                      {defaultNetworks.includes(network.name) && <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground uppercase">default</span>}
                      <span className="sm:hidden text-[10px] text-muted-foreground font-mono">{network.driver}</span>
                    </div>
                  </td>
                  <td className="p-3 font-mono text-muted-foreground hidden sm:table-cell">{network.driver}</td>
                  <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">{network.scope}</td>
                  <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{network.subnet || "—"}</td>
                  <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{network.gateway || "—"}</td>
                  <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">{network.containers}</td>
                  <td className="p-3 sticky right-0 bg-card z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => void handleRemove(network)} className="p-2 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={defaultNetworks.includes(network.name)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {confirmationDialog}

      <PromptDialog open={createDialogOpen} title="Create Network" label="Network name" placeholder="e.g. app-network" confirmLabel="Create Network" pending={createMutation.isPending} onOpenChange={setCreateDialogOpen} onSubmit={async (value) => { try { const network = await createMutation.mutateAsync({ name: value }); toast.success(`Created ${network.name}`); } catch (e) { toast.error("Unable to create network"); throw e; } }} />
    </div>
  );
}
