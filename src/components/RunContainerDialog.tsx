import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RunContainerPayload } from "@/lib/api/types";

interface PortMapping {
  host: string;
  container: string;
}

interface EnvVar {
  key: string;
  value: string;
}

interface VolumeMount {
  source: string;
  target: string;
}

interface RunContainerDialogProps {
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (payload: RunContainerPayload) => Promise<void>;
}

export function RunContainerDialog({ open, pending, onOpenChange, onRun }: RunContainerDialogProps) {
  const [imageName, setImageName] = useState("");
  const [containerName, setContainerName] = useState("");
  const [ports, setPorts] = useState<PortMapping[]>([{ host: "", container: "" }]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: "", value: "" }]);
  const [volumes, setVolumes] = useState<VolumeMount[]>([{ source: "", target: "" }]);

  const addRow = <T,>(setter: Dispatch<SetStateAction<T[]>>, empty: T) => {
    setter((prev) => [...prev, empty]);
  };

  const removeRow = <T,>(setter: Dispatch<SetStateAction<T[]>>, index: number) => {
    setter((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateRow = <T,>(
    setter: Dispatch<SetStateAction<T[]>>,
    index: number,
    field: keyof T,
    value: string,
  ) => {
    setter((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  const reset = () => {
    setImageName("");
    setContainerName("");
    setPorts([{ host: "", container: "" }]);
    setEnvVars([{ key: "", value: "" }]);
    setVolumes([{ source: "", target: "" }]);
  };

  const handleSubmit = async () => {
    if (!imageName.trim()) {
      toast.error("Image name is required");
      return;
    }

    await onRun({
      image: imageName.trim(),
      name: containerName.trim() || undefined,
      ports: ports.filter((port) => port.host && port.container),
      envVars: envVars.filter((envVar) => envVar.key.trim()),
      volumes: volumes.filter((volume) => volume.source && volume.target),
    });

    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto" data-testid="run-container-dialog">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">Run New Container</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1.5">Image *</label>
            <Input
              placeholder="e.g. nginx:alpine, postgres:16"
              value={imageName}
              onChange={(event) => setImageName(event.target.value)}
              className="bg-background border-border font-mono text-sm h-9"
              data-testid="image-input"
            />
          </div>

          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1.5">Container Name (optional)</label>
            <Input
              placeholder="Auto-generated if empty"
              value={containerName}
              onChange={(event) => setContainerName(event.target.value)}
              className="bg-background border-border font-mono text-sm h-9"
              data-testid="container-name-input"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-muted-foreground">Port Mappings</label>
              <button
                type="button"
                onClick={() => addRow(setPorts, { host: "", container: "" })}
                className="text-xs text-primary hover:underline font-mono flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {ports.map((port, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Host port"
                    value={port.host}
                    onChange={(event) => updateRow(setPorts, index, "host", event.target.value)}
                    className="bg-background border-border font-mono text-sm h-8 flex-1"
                  />
                  <span className="text-muted-foreground text-xs font-mono">→</span>
                  <Input
                    placeholder="Container port"
                    value={port.container}
                    onChange={(event) => updateRow(setPorts, index, "container", event.target.value)}
                    className="bg-background border-border font-mono text-sm h-8 flex-1"
                  />
                  {ports.length > 1 && (
                    <button type="button" onClick={() => removeRow(setPorts, index)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-muted-foreground">Environment Variables</label>
              <button
                type="button"
                onClick={() => addRow(setEnvVars, { key: "", value: "" })}
                className="text-xs text-primary hover:underline font-mono flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {envVars.map((envVar, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="KEY"
                    value={envVar.key}
                    onChange={(event) => updateRow(setEnvVars, index, "key", event.target.value)}
                    className="bg-background border-border font-mono text-sm h-8 flex-1"
                  />
                  <span className="text-muted-foreground text-xs font-mono">=</span>
                  <Input
                    placeholder="value"
                    value={envVar.value}
                    onChange={(event) => updateRow(setEnvVars, index, "value", event.target.value)}
                    className="bg-background border-border font-mono text-sm h-8 flex-1"
                  />
                  {envVars.length > 1 && (
                    <button type="button" onClick={() => removeRow(setEnvVars, index)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-mono text-muted-foreground">Volume Mounts</label>
              <button
                type="button"
                onClick={() => addRow(setVolumes, { source: "", target: "" })}
                className="text-xs text-primary hover:underline font-mono flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-1.5">
              {volumes.map((volume, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    placeholder="Host path or volume"
                    value={volume.source}
                    onChange={(event) => updateRow(setVolumes, index, "source", event.target.value)}
                    className="bg-background border-border font-mono text-sm h-8 flex-1"
                  />
                  <span className="text-muted-foreground text-xs font-mono">:</span>
                  <Input
                    placeholder="Container path"
                    value={volume.target}
                    onChange={(event) => updateRow(setVolumes, index, "target", event.target.value)}
                    className="bg-background border-border font-mono text-sm h-8 flex-1"
                  />
                  {volumes.length > 1 && (
                    <button type="button" onClick={() => removeRow(setVolumes, index)} className="p-1 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" className="font-mono text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" className="font-mono text-xs" onClick={() => void handleSubmit()} disabled={pending}>
              Run Container
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
