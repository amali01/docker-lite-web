import { useState } from "react";
import { Network, Trash2, Search, Plus } from "lucide-react";
import { mockNetworks } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Networks() {
  const [filter, setFilter] = useState("");
  const [networks, setNetworks] = useState(mockNetworks);

  const filtered = networks.filter(n => n.name.toLowerCase().includes(filter.toLowerCase()));
  const defaultNets = ['bridge', 'host', 'none'];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Networks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{networks.length} networks</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs"><Plus className="w-3.5 h-3.5" /> Create Network</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Filter networks..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
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
            {filtered.map((n) => (
              <tr key={n.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2">
                  <Network className="w-3.5 h-3.5 text-primary" />
                  {n.name}
                  {defaultNets.includes(n.name) && <span className="text-[9px] px-1 py-0.5 bg-muted rounded text-muted-foreground uppercase">default</span>}
                </td>
                <td className="p-3 font-mono text-muted-foreground">{n.driver}</td>
                <td className="p-3 font-mono text-muted-foreground">{n.scope}</td>
                <td className="p-3 font-mono text-muted-foreground">{n.subnet || '—'}</td>
                <td className="p-3 font-mono text-muted-foreground">{n.gateway || '—'}</td>
                <td className="p-3 font-mono text-muted-foreground">{n.containers}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setNetworks(prev => prev.filter(x => x.id !== n.id)); toast.success(`Removed ${n.name}`); }}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30"
                      disabled={defaultNets.includes(n.name)}
                      title={defaultNets.includes(n.name) ? "Cannot remove default network" : "Remove"}
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
    </div>
  );
}
