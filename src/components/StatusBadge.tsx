import { cn } from "@/lib/utils";

type Status = 'running' | 'stopped' | 'paused' | 'restarting';

const statusConfig: Record<Status, { color: string; dotColor: string; label: string }> = {
  running: { color: 'text-success bg-success/10 border-success/20', dotColor: 'bg-success', label: 'Running' },
  stopped: { color: 'text-destructive bg-destructive/10 border-destructive/20', dotColor: 'bg-destructive', label: 'Stopped' },
  paused: { color: 'text-warning bg-warning/10 border-warning/20', dotColor: 'bg-warning', label: 'Paused' },
  restarting: { color: 'text-primary bg-primary/10 border-primary/20', dotColor: 'bg-primary', label: 'Restarting' },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm text-xs font-mono border", config.color)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dotColor, status === 'running' && "animate-pulse-dot")} />
      {config.label}
    </span>
  );
}
