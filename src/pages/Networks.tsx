import { useState } from "react";
import { Network, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateNetwork, useNetworks, useRemoveNetwork } from "@/hooks/use-networks";

export default function Networks() {
  const [filter, setFilter] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const networksQuery = useNetworks();
  const createMutation = useCreateNetwork();
  const removeMutation = useRemoveNetwork();
  const defaultNetworks = ["bridge", "host", "none"];

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

  const networks = networksQuery.data ?? [];
  const filtered = networks.filter((network) => network.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Networks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{networks.length} networks</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Create Network
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Filter networks..." value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Driver</th>
              <th className="text-left p-3">Scope</th>
              <th className="text-left p-3">Subnet</th>
              <th className="text-left p-3">Gateway</th>
              <th className="text-left p-3">Containers</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((network) => (
              <tr key={network.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-primary" />
                  {network.name}
                  {defaultNetworks.includes(network.name) && <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground uppercase">default</span>}
                </td>
                <td className="p-3 font-mono text-muted-foreground">{network.driver}</td>
                <td className="p-3 font-mono text-muted-foreground">{network.scope}</td>
                <td className="p-3 font-mono text-muted-foreground">{network.subnet || "—"}</td>
                <td className="p-3 font-mono text-muted-foreground">{network.gateway || "—"}</td>
                <td className="p-3 font-mono text-muted-foreground">{network.containers}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={async () => {
                        try {
                          await removeMutation.mutateAsync(network.id);
                          toast.success(`Removed ${network.name}`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Unable to remove network");
                        }
                      }}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30"
                      disabled={defaultNetworks.includes(network.name)}
                      title={defaultNetworks.includes(network.name) ? "Cannot remove default network" : "Remove"}
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
        title="Create Network"
        label="Network name"
        placeholder="e.g. app-network"
        confirmLabel="Create Network"
        pending={createMutation.isPending}
        onOpenChange={setCreateDialogOpen}
        onSubmit={async (value) => {
          try {
            const network = await createMutation.mutateAsync({ name: value });
            toast.success(`Created ${network.name}`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to create network");
            throw error;
          }
        }}
      />
    </div>
  );
}
