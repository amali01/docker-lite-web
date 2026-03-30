import { useState } from "react";
import { Play, Square, RotateCcw, Trash2, Terminal, FileText, Search, Plus } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ContainerLogs } from "@/components/ContainerLogs";
import { RunContainerDialog } from "@/components/RunContainerDialog";
import { mockContainers, Container } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Containers() {
  const [filter, setFilter] = useState("");
  const [containers, setContainers] = useState(mockContainers);
  const [logsContainer, setLogsContainer] = useState<string | null>(null);
  const [runDialogOpen, setRunDialogOpen] = useState(false);

  const filtered = containers.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase()) ||
    c.image.toLowerCase().includes(filter.toLowerCase())
  );

  const handleAction = (action: string, container: Container) => {
    if (action === 'start') {
      setContainers(prev => prev.map(c => c.id === container.id ? { ...c, status: 'running' as const, state: 'Up just now' } : c));
      toast.success(`Started ${container.name}`);
    } else if (action === 'stop') {
      setContainers(prev => prev.map(c => c.id === container.id ? { ...c, status: 'stopped' as const, state: 'Exited (0) just now', cpuPercent: 0, memUsage: '0 B' } : c));
      toast.success(`Stopped ${container.name}`);
    } else if (action === 'restart') {
      toast.success(`Restarting ${container.name}...`);
    } else if (action === 'remove') {
      setContainers(prev => prev.filter(c => c.id !== container.id));
      if (logsContainer === container.name) setLogsContainer(null);
      toast.success(`Removed ${container.name}`);
    } else if (action === 'logs') {
      setLogsContainer(prev => prev === container.name ? null : container.name);
    } else if (action === 'terminal') {
      toast.info(`Opening terminal for ${container.name}...`);
    }
  };

  const handleRunContainer = (newContainer: Container) => {
    setContainers(prev => [newContainer, ...prev]);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Containers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{containers.length} total • {containers.filter(c => c.status === 'running').length} running</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs" onClick={() => setRunDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Run Container
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter containers..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="pl-9 bg-card border-border font-mono text-sm h-9"
        />
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
                <th className="text-left p-3">Container</th>
                <th className="text-left p-3">Image</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">CPU</th>
                <th className="text-left p-3">Mem</th>
                <th className="text-left p-3">Ports</th>
                <th className="text-right p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                  <td className="p-3">
                    <div className="font-mono font-medium text-foreground">{c.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{c.id}</div>
                  </td>
                  <td className="p-3 font-mono text-muted-foreground">{c.image}</td>
                  <td className="p-3">
                    <StatusBadge status={c.status} />
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{c.state}</div>
                  </td>
                  <td className="p-3 font-mono text-muted-foreground">{c.cpuPercent}%</td>
                  <td className="p-3 font-mono text-muted-foreground">{c.memUsage}</td>
                  <td className="p-3 font-mono text-muted-foreground text-[11px]">{c.ports || '—'}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {c.status === 'stopped' ? (
                        <button onClick={() => handleAction('start', c)} className="p-1.5 rounded hover:bg-success/10 text-success" title="Start">
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => handleAction('stop', c)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Stop">
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleAction('restart', c)} className="p-1.5 rounded hover:bg-primary/10 text-primary" title="Restart">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleAction('logs', c)} className={`p-1.5 rounded hover:bg-muted ${logsContainer === c.name ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`} title="Logs">
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleAction('terminal', c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Terminal">
                        <Terminal className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleAction('remove', c)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Remove">
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

      {/* Log Viewer */}
      {logsContainer && (
        <ContainerLogs containerName={logsContainer} onClose={() => setLogsContainer(null)} />
      )}

      {/* Run Container Dialog */}
      <RunContainerDialog open={runDialogOpen} onOpenChange={setRunDialogOpen} onRun={handleRunContainer} />
    </div>
  );
}
