import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEngineInfo, useTestEngineConnection } from "@/hooks/use-engine";
import { getApiBaseUrl, setApiBaseUrl } from "@/lib/api/client";

export default function DockerSettings() {
  const queryClient = useQueryClient();
  const engineQuery = useEngineInfo();
  const testConnectionMutation = useTestEngineConnection();
  const [apiBaseUrl, setApiBaseUrlState] = useState(getApiBaseUrl());

  const engine = engineQuery.data;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure DockLite backend and Docker Engine access</p>
      </div>

      <div className="bg-card border border-border rounded-md p-5 space-y-4">
        <h2 className="text-sm font-mono font-semibold flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          DockLite Backend
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Backend Base URL</label>
            <Input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrlState(event.target.value)}
              className="bg-background border-border font-mono text-sm h-9"
            />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Docker Endpoint</label>
            <Input defaultValue={engine?.endpoint ?? "unknown"} className="bg-background border-border font-mono text-sm h-9" readOnly />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">API Version</label>
            <Input defaultValue={engine?.apiVersion ?? "unknown"} className="bg-background border-border font-mono text-sm h-9" readOnly />
          </div>
          <p className="text-[11px] font-mono text-muted-foreground">
            Default Ubuntu socket: <code className="text-primary">unix:///var/run/docker.sock</code>
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="font-mono text-xs"
              disabled={testConnectionMutation.isPending}
              onClick={async () => {
                try {
                  const result = await testConnectionMutation.mutateAsync(apiBaseUrl.trim().replace(/\/+$/, ""));
                  if (!result.connected) {
                    toast.error(result.errorMessage ?? "Docker is not connected");
                    return;
                  }
                  toast.success("Connection succeeded");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Connection failed");
                }
              }}
            >
              Test Connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="font-mono text-xs"
              onClick={async () => {
                setApiBaseUrl(apiBaseUrl);
                await queryClient.invalidateQueries();
                toast.success("Saved backend URL");
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md p-5 space-y-3">
        <h2 className="text-sm font-mono font-semibold">About DockLite</h2>
        <div className="text-xs font-mono space-y-1 text-muted-foreground">
          <p>Version: 1.0.0-mvp</p>
          <p>Local-first Docker UI for Ubuntu.</p>
          <p>Runs in the browser and talks to a local backend instead of bundling a heavy desktop shell.</p>
        </div>
      </div>
    </div>
  );
}
