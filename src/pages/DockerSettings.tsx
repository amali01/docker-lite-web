import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Info, Pencil, PlugZap, Plus, Save, Server, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  useAuthConfig,
  useSetLoginRequired,
  useUpdateCredentials,
} from "@/hooks/use-auth";
import {
  useCreateEngineTarget,
  useDeleteEngineTarget,
  useEngineInfo,
  useEngineTargets,
  useRetestEngineTarget,
  useSelectEngineTarget,
  useTestEngineConnection,
  useTestEngineTarget,
  useUpdateEngineTarget,
} from "@/hooks/use-engine";
import { ApiClientError, getApiBaseUrl, setApiBaseUrl } from "@/lib/api/client";
import type {
  CreateEngineTargetPayload,
  AuthConfigView,
  EngineTarget,
  EngineTargetHealthStatus,
  EngineTargetKind,
  SshEngineTargetPayload,
  TcpTlsEngineTargetPayload,
  UpdateEngineTargetPayload,
} from "@/lib/api/types";

type EngineTargetDraft = {
  kind: EngineTargetKind;
  label: string;
  socketPath: string;
  host: string;
  port: string;
  username: string;
  authMode: "agent" | "keyFile";
  sshKeyPath: string;
  knownHostsPath: string;
  dockerHostOverride: string;
  serverName: string;
  tlsMode: "serverOnly" | "mtls";
  caPath: string;
  certPath: string;
  tlsKeyPath: string;
};

const defaultDraft: EngineTargetDraft = {
  kind: "ssh",
  label: "",
  socketPath: "/var/run/docker.sock",
  host: "",
  port: "22",
  username: "",
  authMode: "agent",
  sshKeyPath: "",
  knownHostsPath: "",
  dockerHostOverride: "",
  serverName: "",
  tlsMode: "serverOnly",
  caPath: "",
  certPath: "",
  tlsKeyPath: "",
};

function trimOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getStatusTone(status: EngineTargetHealthStatus | null | undefined) {
  if (status === "healthy") {
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  }

  if (status === "degraded") {
    return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  }

  if (status === "unhealthy") {
    return "bg-rose-500/10 text-rose-700 border-rose-500/20";
  }

  return "bg-muted text-muted-foreground border-border";
}

function createDraftFromTarget(target: EngineTarget): EngineTargetDraft {
  const endpoint = target.endpoint;

  if (target.kind === "local") {
    return {
      ...defaultDraft,
      kind: "local",
      label: target.label,
      socketPath: endpoint.replace(/^unix:\/\//, ""),
    };
  }

  if (target.kind === "ssh") {
    const match = endpoint.match(/^ssh:\/\/([^@]+)@(.+)$/);
    return {
      ...defaultDraft,
      kind: "ssh",
      label: target.label,
      host: match?.[2] ?? "",
      username: match?.[1] ?? "",
      port: "22",
    };
  }

  const tlsMatch = endpoint.match(/^tcp:\/\/([^:]+):(\d+)$/);
  return {
    ...defaultDraft,
    kind: "tcpTls",
    label: target.label,
    host: tlsMatch?.[1] ?? "",
    port: tlsMatch?.[2] ?? "2376",
  };
}

function buildCreatePayload(draft: EngineTargetDraft): CreateEngineTargetPayload {
  if (draft.kind === "local") {
    return {
      kind: "local",
      label: draft.label.trim(),
      socketPath: draft.socketPath.trim(),
    };
  }

  if (draft.kind === "ssh") {
    return {
      kind: "ssh",
      label: draft.label.trim(),
      host: draft.host.trim(),
      port: Number(draft.port),
      username: draft.username.trim(),
      authMode: draft.authMode,
      keyPath: trimOrNull(draft.sshKeyPath),
      knownHostsPath: trimOrNull(draft.knownHostsPath),
      dockerHostOverride: trimOrNull(draft.dockerHostOverride),
    };
  }

  return {
    kind: "tcpTls",
    label: draft.label.trim(),
    host: draft.host.trim(),
    port: Number(draft.port),
    serverName: trimOrNull(draft.serverName),
    tlsMode: draft.tlsMode,
    caPath: trimOrNull(draft.caPath),
    certPath: trimOrNull(draft.certPath),
    keyPath: trimOrNull(draft.tlsKeyPath),
  };
}

function buildUpdatePayload(draft: EngineTargetDraft): UpdateEngineTargetPayload {
  return buildCreatePayload(draft) as UpdateEngineTargetPayload;
}

function validateDraft(draft: EngineTargetDraft) {
  if (!draft.label.trim()) {
    throw new Error("Target label is required");
  }

  if (draft.kind === "local" && !draft.socketPath.trim()) {
    throw new Error("Socket path is required");
  }

  if (draft.kind === "ssh") {
    if (!draft.host.trim() || !draft.username.trim()) {
      throw new Error("SSH targets require host and username");
    }
    if (!Number.isInteger(Number(draft.port)) || Number(draft.port) <= 0) {
      throw new Error("SSH targets require a valid port");
    }
    if (draft.authMode === "keyFile" && !draft.sshKeyPath.trim()) {
      throw new Error("SSH key-file auth requires a private key path");
    }
  }

  if (draft.kind === "tcpTls") {
    if (!draft.host.trim()) {
      throw new Error("TCP/TLS targets require a host");
    }
    if (!Number.isInteger(Number(draft.port)) || Number(draft.port) <= 0) {
      throw new Error("TCP/TLS targets require a valid port");
    }
    if (!draft.caPath.trim()) {
      throw new Error("TCP/TLS targets require a CA certificate path");
    }
    if (draft.tlsMode === "mtls" && (!draft.certPath.trim() || !draft.tlsKeyPath.trim())) {
      throw new Error("mTLS targets require certificate and key paths");
    }
  }
}

export default function DockerSettings() {
  const queryClient = useQueryClient();
  const engineQuery = useEngineInfo();
  const engineTargetsQuery = useEngineTargets();
  const selectEngineMutation = useSelectEngineTarget();
  const createTargetMutation = useCreateEngineTarget();
  const updateTargetMutation = useUpdateEngineTarget();
  const deleteTargetMutation = useDeleteEngineTarget();
  const testTargetMutation = useTestEngineTarget();
  const retestTargetMutation = useRetestEngineTarget();
  const testConnectionMutation = useTestEngineConnection();
  const authConfigQuery = useAuthConfig();
  const updateCredentialsMutation = useUpdateCredentials();
  const setLoginRequiredMutation = useSetLoginRequired();
  const [confirmDisableLoginOpen, setConfirmDisableLoginOpen] = useState(false);
  const [apiBaseUrl, setApiBaseUrlState] = useState(getApiBaseUrl());
  const [draft, setDraft] = useState<EngineTargetDraft>(defaultDraft);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);
  const [adminUsername, setAdminUsername] = useState("admin");
  const [adminPassword, setAdminPassword] = useState("");

  const engine = engineQuery.data;
  const engineTargets = engineTargetsQuery.data ?? [];
  const authConfig = authConfigQuery.data;
  const isEditing = editingTargetId !== null;
  const busy =
    selectEngineMutation.isPending ||
    createTargetMutation.isPending ||
    updateTargetMutation.isPending ||
    deleteTargetMutation.isPending ||
    testTargetMutation.isPending ||
    retestTargetMutation.isPending;
  const authBusy = updateCredentialsMutation.isPending || setLoginRequiredMutation.isPending;

  const backendBaseUrlId = "backend-base-url";
  const loginRequiredId = "require-login";
  const engineGroupLabelId = "docker-engine-label";
  const dockerEndpointId = "docker-endpoint";
  const apiVersionId = "docker-api-version";
  const adminUsernameId = "admin-username";
  const adminPasswordId = "admin-password";

  const selectedTarget =
    engineTargets.find((target) => target.id === engine?.selectedEngineId) ??
    engineTargets.find((target) => target.active) ??
    null;

  function updateDraft(patch: Partial<EngineTargetDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function resetDraft() {
    setEditingTargetId(null);
    setDraft(defaultDraft);
  }

  useEffect(() => {
    if (!authConfig) {
      return;
    }

    setAdminUsername(authConfig.adminUsername);
  }, [authConfig]);

  async function handleSetLoginRequired(required: boolean) {
    try {
      await setLoginRequiredMutation.mutateAsync(required);
      toast.success(required ? "Login is now required." : "Login disabled on this device.");
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't change the login setting.");
    }
  }

  async function handleSaveTarget() {
    try {
      validateDraft(draft);

      if (editingTargetId) {
        const updated = await updateTargetMutation.mutateAsync({
          targetId: editingTargetId,
          payload: buildUpdatePayload(draft),
        });
        toast.success(`Updated ${updated.label}`);
      } else {
        const created = await createTargetMutation.mutateAsync(buildCreatePayload(draft));
        toast.success(`Added ${created.label}`);
      }

      resetDraft();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save engine target");
    }
  }

  async function handleTestTarget() {
    try {
      validateDraft(draft);
      const health = await testTargetMutation.mutateAsync(buildCreatePayload(draft));

      if (health.status === "healthy") {
        toast.success(health.message ?? "Connection succeeded");
        return;
      }

      toast.error(health.message ?? "Connection failed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to test engine target");
    }
  }

  async function handleUpdateCredentials() {
    try {
      if (!adminUsername.trim()) {
        throw new Error("Admin username is required");
      }

      if (!adminPassword.trim()) {
        throw new Error("Admin password is required");
      }

      await updateCredentialsMutation.mutateAsync({
        username: adminUsername.trim(),
        password: adminPassword,
      });

      setAdminPassword("");
      toast.success("Updated admin credentials");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to update admin credentials");
    }
  }

  return (
    <div className="max-w-5xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Configure DockLite backend and Docker Engine access</p>
      </div>

      <div className="rounded-md border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-mono font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Admin Credentials
        </div>

        {authConfig ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Password login enabled</Badge>
              {authConfig.defaultCredentialsActive ? (
                <Badge variant="destructive">Default admin password active</Badge>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor={adminUsernameId} className="mb-1 block text-xs font-mono text-muted-foreground">
                  Admin Username
                </Label>
                <Input
                  id={adminUsernameId}
                  value={adminUsername}
                  onChange={(event) => setAdminUsername(event.target.value)}
                  className="h-9 border-border bg-background font-mono text-sm"
                />
              </div>

              <div>
                <Label htmlFor={adminPasswordId} className="mb-1 block text-xs font-mono text-muted-foreground">
                  Admin Password
                </Label>
                <Input
                  id={adminPasswordId}
                  type="password"
                  autoComplete="new-password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  className="h-9 border-border bg-background font-mono text-sm"
                />
              </div>
            </div>

            <p className="text-xs font-mono text-muted-foreground">
              Updating credentials refreshes the current admin token immediately.
            </p>

            <div className="flex justify-end">
              <Button
                size="sm"
                className="gap-1.5 font-mono text-xs"
                onClick={() => void handleUpdateCredentials()}
                disabled={authBusy || !adminUsername.trim() || !adminPassword.trim()}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Update Credentials
              </Button>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor={loginRequiredId} className="text-sm font-mono">
                    Require login
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ask for the admin password before opening DockLite on this device.
                  </p>
                </div>
                <Switch
                  id={loginRequiredId}
                  checked={authConfig.loginRequired}
                  disabled={authBusy || (!authConfig.canDisableLogin && authConfig.loginRequired)}
                  onCheckedChange={(next) => {
                    if (next) {
                      void handleSetLoginRequired(true);
                    } else {
                      setConfirmDisableLoginOpen(true);
                    }
                  }}
                />
              </div>

              {!authConfig.canDisableLogin ? (
                <p className="text-xs font-mono text-muted-foreground">
                  Login stays on while DockLite is reachable over the network.
                </p>
              ) : !authConfig.loginRequired ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Login is off. Anyone who can reach this machine can control Docker and change
                    these credentials without a password.
                  </span>
                </div>
              ) : null}
            </div>

            <AlertDialog open={confirmDisableLoginOpen} onOpenChange={setConfirmDisableLoginOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disable login?</AlertDialogTitle>
                  <AlertDialogDescription>
                    DockLite will open without a password on this device. Anyone who can reach this
                    machine will be able to control Docker and change these credentials. Only do this
                    on a computer you trust.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void handleSetLoginRequired(false)}
                  >
                    Disable login
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {authConfigQuery.isLoading ? "Loading admin credentials…" : "Unable to load admin credentials."}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-mono font-semibold">
          <Server className="h-4 w-4 text-primary" />
          DockLite Backend
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor={backendBaseUrlId} className="mb-1 block text-xs font-mono text-muted-foreground">
              Backend Base URL
            </Label>
            <Input
              id={backendBaseUrlId}
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrlState(event.target.value)}
              className="h-9 border-border bg-background font-mono text-sm"
            />
          </div>

          <div>
            <Label id={engineGroupLabelId} className="mb-1 block text-xs font-mono text-muted-foreground">
              Docker Engine
            </Label>
            {engineTargets.length > 0 ? (
              <ToggleGroup
                type="single"
                value={engine?.selectedEngineId}
                className="flex flex-wrap justify-start"
                aria-labelledby={engineGroupLabelId}
                onValueChange={async (value) => {
                  if (!value || value === engine?.selectedEngineId) {
                    return;
                  }

                  try {
                    const result = await selectEngineMutation.mutateAsync({ targetId: value });
                    toast.success(`Switched to ${result.endpoint}`);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Unable to switch engine");
                  }
                }}
              >
                {engineTargets.map((target) => (
                  <ToggleGroupItem
                    key={target.id}
                    value={target.id}
                    variant="outline"
                    className="font-mono text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                    disabled={!target.available || selectEngineMutation.isPending}
                    aria-label={target.label}
                  >
                    {target.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : (
              <p className="text-xs font-mono text-muted-foreground">No engine targets available.</p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor={dockerEndpointId} className="mb-1 block text-xs font-mono text-muted-foreground">
                Docker Endpoint
              </Label>
              <Input
                id={dockerEndpointId}
                value={engine?.endpoint ?? "unknown"}
                className="h-9 border-border bg-background font-mono text-sm"
                readOnly
              />
            </div>
            <div>
              <Label htmlFor={apiVersionId} className="mb-1 block text-xs font-mono text-muted-foreground">
                API Version
              </Label>
              <Input
                id={apiVersionId}
                value={engine?.apiVersion ?? "unknown"}
                className="h-9 border-border bg-background font-mono text-sm"
                readOnly
              />
            </div>
          </div>

          {selectedTarget ? (
            <div className="rounded-md border border-border/70 bg-background/60 p-3 text-xs font-mono text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">{selectedTarget.label}</span>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {selectedTarget.kind}
                </Badge>
                <Badge variant="outline" className="font-mono text-[11px]">
                  {selectedTarget.source}
                </Badge>
                <Badge variant="outline" className={`font-mono text-[11px] ${getStatusTone(selectedTarget.lastHealth?.status)}`}>
                  {selectedTarget.lastHealth?.status ?? "unknown"}
                </Badge>
              </div>
              <p className="mt-2 break-all">{selectedTarget.endpoint}</p>
              {selectedTarget.lastHealth?.message ? <p className="mt-1">{selectedTarget.lastHealth.message}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              className="gap-1.5 font-mono text-xs"
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
              <PlugZap className="h-3.5 w-3.5" />
              Test Connection
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 font-mono text-xs"
              onClick={async () => {
                setApiBaseUrl(apiBaseUrl);
                await queryClient.invalidateQueries();
                toast.success("Saved backend URL");
              }}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-mono font-semibold">Engine Targets</h2>
            <p className="mt-1 text-xs font-mono text-muted-foreground">
              Local sockets, SSH hosts, and TLS-secured Docker daemons managed by the backend.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 whitespace-nowrap font-mono text-[11px]">
            {engineTargets.length} configured
          </Badge>
        </div>

        <div className="space-y-3">
          {engineTargets.map((target) => (
            <div
              key={target.id}
              role="group"
              aria-label={`Engine target ${target.label}`}
              className="rounded-md border border-border/70 bg-background/50 p-3"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{target.label}</span>
                    {target.active ? <Badge className="font-mono text-[11px]">active</Badge> : null}
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {target.kind}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {target.source}
                    </Badge>
                    <Badge variant="outline" className={`font-mono text-[11px] ${getStatusTone(target.lastHealth?.status)}`}>
                      {target.lastHealth?.status ?? "unknown"}
                    </Badge>
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">{target.endpoint}</p>
                  {target.lastHealth?.message ? (
                    <p className="text-xs font-mono text-muted-foreground">{target.lastHealth.message}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {!target.active ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 font-mono text-xs"
                      disabled={!target.available || busy}
                      onClick={async () => {
                        try {
                          const result = await selectEngineMutation.mutateAsync({ targetId: target.id });
                          toast.success(`Switched to ${result.endpoint}`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Unable to switch engine");
                        }
                      }}
                    >
                      <PlugZap className="h-3.5 w-3.5" />
                      Use
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 font-mono text-xs"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        const health = await retestTargetMutation.mutateAsync(target.id);
                        if (health.status === "healthy") {
                          toast.success(health.message ?? "Connection succeeded");
                          return;
                        }
                        toast.error(health.message ?? "Connection failed");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Unable to test engine target");
                      }
                    }}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Re-test
                  </Button>
                  {target.source === "saved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 font-mono text-xs"
                      disabled={busy}
                      onClick={() => {
                        setEditingTargetId(target.id);
                        setDraft(createDraftFromTarget(target));
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {target.source === "saved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 font-mono text-xs"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await deleteTargetMutation.mutateAsync(target.id);
                          if (editingTargetId === target.id) {
                            resetDraft();
                          }
                          toast.success(`Removed ${target.label}`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Unable to remove engine target");
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-5" />

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-mono font-semibold">{isEditing ? "Edit Engine Target" : "New Engine Target"}</h3>
              <p className="mt-1 text-xs font-mono text-muted-foreground">
                Keep the transport config in DockLite while the backend stores secrets and validates connectivity.
              </p>
            </div>
            {isEditing ? (
              <Badge variant="outline" className="font-mono text-[11px]">
                editing
              </Badge>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="target-kind" className="mb-1 block text-xs font-mono text-muted-foreground">Target Type</Label>
              <Select value={draft.kind} onValueChange={(value: EngineTargetKind) => updateDraft({ kind: value })}>
                <SelectTrigger id="target-kind" aria-label="Target Type" className="h-9 border-border bg-background font-mono text-sm">
                  <SelectValue placeholder="Select a target type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Socket</SelectItem>
                  <SelectItem value="ssh">SSH Host</SelectItem>
                  <SelectItem value="tcpTls">TCP/TLS Daemon</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="target-label" className="mb-1 block text-xs font-mono text-muted-foreground">Label</Label>
              <Input
                id="target-label"
                value={draft.label}
                onChange={(event) => updateDraft({ label: event.target.value })}
                className="h-9 border-border bg-background font-mono text-sm"
                placeholder={draft.kind === "local" ? "System Docker" : draft.kind === "ssh" ? "Prod Server" : "Staging TLS"}
              />
            </div>

            {draft.kind === "local" ? (
              <div className="md:col-span-2">
                <Label htmlFor="target-socket-path" className="mb-1 block text-xs font-mono text-muted-foreground">Socket Path</Label>
                <Input
                  id="target-socket-path"
                  value={draft.socketPath}
                  onChange={(event) => updateDraft({ socketPath: event.target.value })}
                  className="h-9 border-border bg-background font-mono text-sm"
                  placeholder="/var/run/docker.sock"
                />
              </div>
            ) : null}

            {draft.kind === "ssh" ? (
              <>
                <div>
                  <Label htmlFor="target-host" className="mb-1 block text-xs font-mono text-muted-foreground">Host</Label>
                  <Input
                    id="target-host"
                    value={draft.host}
                    onChange={(event) => updateDraft({ host: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="prod.example.internal"
                  />
                </div>
                <div>
                  <Label htmlFor="target-port" className="mb-1 block text-xs font-mono text-muted-foreground">Port</Label>
                  <Input
                    id="target-port"
                    value={draft.port}
                    onChange={(event) => updateDraft({ port: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="22"
                  />
                </div>
                <div>
                  <Label htmlFor="target-username" className="mb-1 block text-xs font-mono text-muted-foreground">Username</Label>
                  <Input
                    id="target-username"
                    value={draft.username}
                    onChange={(event) => updateDraft({ username: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="ops"
                  />
                </div>
                <div>
                  <Label htmlFor="target-auth-mode" className="mb-1 block text-xs font-mono text-muted-foreground">Auth Mode</Label>
                  <Select value={draft.authMode} onValueChange={(value: "agent" | "keyFile") => updateDraft({ authMode: value })}>
                    <SelectTrigger id="target-auth-mode" aria-label="Auth Mode" className="h-9 border-border bg-background font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">SSH Agent</SelectItem>
                      <SelectItem value="keyFile">Key File</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {draft.authMode === "keyFile" ? (
                  <div className="md:col-span-2">
                    <Label htmlFor="target-private-key-path" className="mb-1 block text-xs font-mono text-muted-foreground">Private Key Path</Label>
                    <Input
                      id="target-private-key-path"
                      value={draft.sshKeyPath}
                      onChange={(event) => updateDraft({ sshKeyPath: event.target.value })}
                      className="h-9 border-border bg-background font-mono text-sm"
                      placeholder="/home/user/.ssh/id_ed25519"
                    />
                  </div>
                ) : null}
                <div>
                  <Label htmlFor="target-known-hosts-path" className="mb-1 block text-xs font-mono text-muted-foreground">Known Hosts Path</Label>
                  <Input
                    id="target-known-hosts-path"
                    value={draft.knownHostsPath}
                    onChange={(event) => updateDraft({ knownHostsPath: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label htmlFor="target-docker-host-override" className="mb-1 block text-xs font-mono text-muted-foreground">Docker Host Override</Label>
                  <Input
                    id="target-docker-host-override"
                    value={draft.dockerHostOverride}
                    onChange={(event) => updateDraft({ dockerHostOverride: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="Optional"
                  />
                </div>
              </>
            ) : null}

            {draft.kind === "tcpTls" ? (
              <>
                <div>
                  <Label htmlFor="target-host" className="mb-1 block text-xs font-mono text-muted-foreground">Host</Label>
                  <Input
                    id="target-host"
                    value={draft.host}
                    onChange={(event) => updateDraft({ host: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="staging.example.internal"
                  />
                </div>
                <div>
                  <Label htmlFor="target-port" className="mb-1 block text-xs font-mono text-muted-foreground">Port</Label>
                  <Input
                    id="target-port"
                    value={draft.port}
                    onChange={(event) => updateDraft({ port: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="2376"
                  />
                </div>
                <div>
                  <Label htmlFor="target-tls-mode" className="mb-1 block text-xs font-mono text-muted-foreground">TLS Mode</Label>
                  <Select value={draft.tlsMode} onValueChange={(value: "serverOnly" | "mtls") => updateDraft({ tlsMode: value })}>
                    <SelectTrigger id="target-tls-mode" aria-label="TLS Mode" className="h-9 border-border bg-background font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="serverOnly">Server Only</SelectItem>
                      <SelectItem value="mtls">Mutual TLS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="target-server-name" className="mb-1 block text-xs font-mono text-muted-foreground">Server Name</Label>
                  <Input
                    id="target-server-name"
                    value={draft.serverName}
                    onChange={(event) => updateDraft({ serverName: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="target-ca-path" className="mb-1 block text-xs font-mono text-muted-foreground">CA Certificate Path</Label>
                  <Input
                    id="target-ca-path"
                    value={draft.caPath}
                    onChange={(event) => updateDraft({ caPath: event.target.value })}
                    className="h-9 border-border bg-background font-mono text-sm"
                    placeholder="/etc/docklite/ca.pem"
                  />
                </div>
                {draft.tlsMode === "mtls" ? (
                  <>
                    <div>
                      <Label htmlFor="target-cert-path" className="mb-1 block text-xs font-mono text-muted-foreground">Client Certificate Path</Label>
                      <Input
                        id="target-cert-path"
                        value={draft.certPath}
                        onChange={(event) => updateDraft({ certPath: event.target.value })}
                        className="h-9 border-border bg-background font-mono text-sm"
                        placeholder="/etc/docklite/cert.pem"
                      />
                    </div>
                    <div>
                      <Label htmlFor="target-tls-key-path" className="mb-1 block text-xs font-mono text-muted-foreground">Client Key Path</Label>
                      <Input
                        id="target-tls-key-path"
                        value={draft.tlsKeyPath}
                        onChange={(event) => updateDraft({ tlsKeyPath: event.target.value })}
                        className="h-9 border-border bg-background font-mono text-sm"
                        placeholder="/etc/docklite/key.pem"
                      />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" className="gap-1.5 font-mono text-xs" disabled={busy} onClick={handleTestTarget}>
              <PlugZap className="h-3.5 w-3.5" />
              Test Target
            </Button>
            <Button size="sm" className="gap-1.5 font-mono text-xs" disabled={busy} onClick={handleSaveTarget}>
              {isEditing ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {isEditing ? "Save Changes" : "Add Engine Target"}
            </Button>
            <Button size="sm" variant="ghost" className="font-mono text-xs" disabled={busy} onClick={resetDraft}>
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-mono font-semibold">
          <Info className="h-4 w-4 text-primary" />
          About DockLite
        </div>

        <div className="mb-4 flex items-center gap-2">
          <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
            v0.1.0
          </span>
          <span className="font-mono text-xs text-muted-foreground">Early release</span>
        </div>

        <div className="max-w-prose space-y-3">
          <p className="text-sm font-medium leading-relaxed text-foreground">
            A native Docker GUI for Linux: no Electron shell, no virtual machine.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Runs in your browser and drives the Docker Engine already on your host through a small
            local bridge. Manage containers, images, volumes and networks without a multi-gigabyte
            desktop app humming in the background.
          </p>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <a
            href="https://github.com/amali01/docker-lite-web"
            target="_blank"
            rel="noopener noreferrer"
            title="View DockLite on GitHub"
            className="inline-flex w-fit items-center gap-2 rounded font-mono text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Project repo
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
