import { Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { mockSystemInfo } from "@/lib/mock-data";

export default function DockerSettings() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure Docker Engine connection</p>
      </div>

      <div className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-sm font-mono font-semibold flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          Docker Engine Connection
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Socket / API Endpoint</label>
            <Input defaultValue="unix:///var/run/docker.sock" className="bg-background border-border font-mono text-sm h-9" />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">API Version</label>
            <Input defaultValue={mockSystemInfo.apiVersion} className="bg-background border-border font-mono text-sm h-9" readOnly />
          </div>
          <p className="text-[11px] font-mono text-muted-foreground">
            For remote Docker, use TCP: <code className="text-primary">tcp://192.168.1.100:2375</code>
          </p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="font-mono text-xs">Test Connection</Button>
            <Button size="sm" variant="outline" className="font-mono text-xs">Save</Button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md p-5 space-y-3">
        <h2 className="text-sm font-mono font-semibold">About DockLite</h2>
        <div className="text-xs font-mono space-y-1 text-muted-foreground">
          <p>Version: 1.0.0-mvp</p>
          <p>A lightweight Docker GUI — no Docker Desktop required.</p>
          <p>Connects directly to the Docker Engine API.</p>
        </div>
      </div>
    </div>
  );
}
