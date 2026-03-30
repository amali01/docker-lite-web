import { useState } from "react";
import { HardDrive, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useCreateVolume, useRemoveVolume, useVolumes } from "@/hooks/use-volumes";

export default function Volumes() {
  const [filter, setFilter] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const volumesQuery = useVolumes();
  const createMutation = useCreateVolume();
  const removeMutation = useRemoveVolume();
  const volumes = volumesQuery.data ?? [];
  const filtered = volumes.filter((volume) => volume.name.toLowerCase().includes(filter.toLowerCase()));
  const selection = useTableSelection(filtered.map((volume) => volume.name));

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Volumes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{volumes.length} volumes</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Create Volume
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Filter volumes..." value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="w-10 p-3">
                <Checkbox
                  aria-label="Select all volumes"
                  checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                />
              </th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Driver</th>
              <th className="text-left p-3">Mount Point</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">In Use</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((volume) => (
              <tr key={volume.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                <td className="p-3">
                  <Checkbox
                    aria-label={`Select volume ${volume.name}`}
                    checked={selection.selectedIds.includes(volume.name)}
                    onCheckedChange={(checked) => selection.toggleOne(volume.name, checked === true)}
                  />
                </td>
                <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-primary" />
                  {volume.name}
                </td>
                <td className="p-3 font-mono text-muted-foreground">{volume.driver}</td>
                <td className="p-3 font-mono text-muted-foreground text-[11px] max-w-[200px] truncate">{volume.mountpoint}</td>
                <td className="p-3 font-mono text-muted-foreground">{volume.size}</td>
                <td className="p-3">
                  <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${volume.inUse ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                    {volume.inUse ? "Yes" : "No"}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={async () => {
                        try {
                          await removeMutation.mutateAsync(volume.name);
                          toast.success(`Removed ${volume.name}`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Unable to remove volume");
                        }
                      }}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30"
                      disabled={volume.inUse}
                      title={volume.inUse ? "Volume in use" : "Remove"}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PromptDialog
        open={createDialogOpen}
        title="Create Volume"
        label="Volume name"
        placeholder="e.g. postgres-data"
        confirmLabel="Create Volume"
        pending={createMutation.isPending}
        onOpenChange={setCreateDialogOpen}
        onSubmit={async (value) => {
          try {
            const volume = await createMutation.mutateAsync({ name: value });
            toast.success(`Created ${volume.name}`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to create volume");
            throw error;
          }
        }}
      />
    </div>
  );
}
