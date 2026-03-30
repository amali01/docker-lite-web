import { useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Container } from "@/lib/mock-data";

interface PortMapping {
  host: string;
  container: string;
}

interface EnvVar {
  key: string;
  value: string;
}

interface VolumeMount {
  host: string;
  container: string;
}

interface RunContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (container: Container) => void;
}

export function RunContainerDialog({ open, onOpenChange, onRun }: RunContainerDialogProps) {
  const [imageName, setImageName] = useState("");
  const [containerName, setContainerName] = useState("");
  const [ports, setPorts] = useState<PortMapping[]>([{ host: "", container: "" }]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: "", value: "" }]);
  const [volumes, setVolumes] = useState<VolumeMount[]>([{ host: "", container: "" }]);

  const addRow = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, empty: T) => {
    setter(prev => [...prev, empty]);
  };

  const removeRow = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number) => {
    setter(prev => prev.filter((_, i) => i !== index));
  };

  const updateRow = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number, field: keyof T, value: string) => {
    setter(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    if (!imageName.trim()) {
      toast.error("Image name is required");
      return;
    }

    const name = containerName.trim() || imageName.split(":")[0].split("/").pop() + "-" + Math.random().toString(36).slice(2, 6);

    const portStr = ports
      .filter(p => p.host && p.container)
      .map(p => `0.0.0.0:${p.host}->${p.container}/tcp`)
      .join(", ");

    const newContainer: Container = {
      id: Math.random().toString(36).slice(2, 14),
      name,
      image: imageName.trim(),
      status: "running",
      state: "Up just now",
      ports: portStr,
      created: new Date().toISOString(),
      cpuPercent: 0,
      memUsage: "0 B",
      memLimit: "512 MiB",
      netIO: "0 B / 0 B",
      blockIO: "0 B / 0 B",
    };

    onRun(newContainer);
    toast.success(`Container ${name} started`);
    onOpenChange(false);

    // Reset
    setImageName("");
    setContainerName("");
    setPorts([{ host: "", container: "" }]);
    setEnvVars([{ key: "", value: "" }]);
    setVolumes([{ host: "", container: "" }]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto" data-testid="run-container-dialog">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">Run New Container</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Image */}
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1.5">Image *</label>
            <Input
              placeholder="e.g. nginx:alpine, postgres:16"
              value={imageName}
              onChange={e => setImageName(e.target.value)}
              className="bg-background border-border font-mono text-sm h-9"
              data-testid="image-input"
            />
          </div>

          {/* Container Name */}
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1.5">Container Name (optional)</label>
            <Input
              placeholder="Auto-generated if empty"
              value={containerName}
              onChange={e => setContainerName(e.target.value)}
              className="bg-background border-border font-mono text-sm h-9"
              data-testid="container-name-input"
            />
          </div>

          {/* Port Mappings */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-muted-foreground">Port Mappings</label>
              <button onClick={() => addRow(setPorts, { host: "", container: "" })} className="text-xs text-primary hover:underline font-mono flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {ports.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Host port" value={p.host} onChange={e => updateRow(setPorts, i, "host", e.target.value)} className="bg-background border-border font-mono text-sm h-8 flex-1" />
                  <span className="text-muted-foreground text-xs font-mono">→</span>
                  <Input placeholder="Container port" value={p.container} onChange={e => updateRow(setPorts, i, "container", e.target.value)} className="bg-background border-border font-mono text-sm h-8 flex-1" />
                  {ports.length > 1 && (
                    <button onClick={() => removeRow(setPorts, i)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Environment Variables */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-muted-foreground">Environment Variables</label>
              <button onClick={() => addRow(setEnvVars, { key: "", value: "" })} className="text-xs text-primary hover:underline font-mono flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {envVars.map((env, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="KEY" value={env.key} onChange={e => updateRow(setEnvVars, i, "key", e.target.value)} className="bg-background border-border font-mono text-sm h-8 flex-1" />
                  <span className="text-muted-foreground text-xs font-mono">=</span>
                  <Input placeholder="value" value={env.value} onChange={e => updateRow(setEnvVars, i, "value", e.target.value)} className="bg-background border-border font-mono text-sm h-8 flex-1" />
                  {envVars.length > 1 && (
                    <button onClick={() => removeRow(setEnvVars, i)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Volume Mounts */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-muted-foreground">Volume Mounts</label>
              <button onClick={() => addRow(setVolumes, { host: "", container: "" })} className="text-xs text-primary hover:underline font-mono flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {volumes.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Host path or volume" value={v.host} onChange={e => updateRow(setVolumes, i, "host", e.target.value)} className="bg-background border-border font-mono text-sm h-8 flex-1" />
                  <span className="text-muted-foreground text-xs font-mono">:</span>
                  <Input placeholder="Container path" value={v.container} onChange={e => updateRow(setVolumes, i, "container", e.target.value)} className="bg-background border-border font-mono text-sm h-8 flex-1" />
                  {volumes.length > 1 && (
                    <button onClick={() => removeRow(setVolumes, i)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" className="font-mono text-xs" onClick={handleSubmit}>
              Run Container
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
