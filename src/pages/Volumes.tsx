import { useState } from "react";
import { HardDrive, Trash2, Search, Plus } from "lucide-react";
import { mockVolumes } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Volumes() {
  const [filter, setFilter] = useState("");
  const [volumes, setVolumes] = useState(mockVolumes);

  const filtered = volumes.filter(v => v.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Volumes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{volumes.length} volumes</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs"><Plus className="w-3.5 h-3.5" /> Create Volume</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Filter volumes..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Driver</th>
              <th className="text-left p-3">Mount Point</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">In Use</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-primary" />
                  {v.name}
                </td>
                <td className="p-3 font-mono text-muted-foreground">{v.driver}</td>
                <td className="p-3 font-mono text-muted-foreground text-[11px] max-w-[200px] truncate">{v.mountpoint}</td>
                <td className="p-3 font-mono text-muted-foreground">{v.size}</td>
                <td className="p-3">
                  <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${v.inUse ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {v.inUse ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setVolumes(prev => prev.filter(x => x.name !== v.name)); toast.success(`Removed ${v.name}`); }}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30"
                      disabled={v.inUse}
                      title={v.inUse ? "Volume in use" : "Remove"}
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
