import { FileText, Play, RotateCcw, Square, Terminal, Trash2, ArrowUpCircle } from "lucide-react";
import { ContainerSummary } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface ContainerActionButtonsProps {
  container: ContainerSummary;
  compact?: boolean;
  logsActive?: boolean;
  terminalActive?: boolean;
  onAction: (action: "start" | "stop" | "restart" | "remove" | "logs" | "terminal" | "rebuild", container: ContainerSummary) => void;
}

export function ContainerActionButtons({ container, compact = false, logsActive, terminalActive, onAction }: ContainerActionButtonsProps) {
  const containerName = container.name.replace(/^\//, "");
  const buttonClassName = cn(
    "rounded transition-colors",
    compact ? "p-1 md:p-1.5" : "p-1.5",
  );
  const iconClassName = compact ? "w-3 h-3 md:w-3.5 md:h-3.5" : "w-3.5 h-3.5";

  return (
    <div className={cn("flex items-center justify-end", compact ? "gap-0.5 md:gap-1" : "gap-1")}>
      {container.status === "stopped" ? (
        <button onClick={() => onAction("start", container)} className={cn(buttonClassName, "hover:bg-success/10 text-success")} title="Start" aria-label={`Start container ${containerName}`}>
          <Play className={iconClassName} />
        </button>
      ) : (
        <button onClick={() => onAction("stop", container)} className={cn(buttonClassName, "hover:bg-destructive/10 text-destructive")} title="Stop" aria-label={`Stop container ${containerName}`}>
          <Square className={iconClassName} />
        </button>
      )}
      <button onClick={() => onAction("rebuild", container)} className={cn(buttonClassName, "hover:bg-primary/10 text-primary")} title="Refresh container" aria-label={`Refresh container ${containerName}`}>
        <ArrowUpCircle className={iconClassName} />
      </button>
      <button onClick={() => onAction("restart", container)} className={cn(buttonClassName, "hover:bg-primary/10 text-primary")} title="Restart" aria-label={`Restart container ${containerName}`}>
        <RotateCcw className={iconClassName} />
      </button>
      <button
        onClick={() => onAction("logs", container)}
        className={cn(buttonClassName, "hover:bg-muted", logsActive ? "text-primary bg-primary/10" : "text-muted-foreground")}
        title="Logs"
        aria-label={`View logs for ${containerName}`}
      >
        <FileText className={iconClassName} />
      </button>
      <button 
        disabled={container.status !== "running"}
        onClick={() => onAction("terminal", container)} 
        className={cn(buttonClassName, "hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed", terminalActive ? "text-primary bg-primary/10" : "text-muted-foreground")} 
        title={container.status === "running" ? "Terminal" : "Terminal (container must be running)"}
        aria-label={container.status === "running" ? `Open terminal for ${containerName}` : `Open terminal for ${containerName} (container must be running)`}
      >
        <Terminal className={iconClassName} />
      </button>
      <button onClick={() => onAction("remove", container)} className={cn(buttonClassName, "hover:bg-destructive/10 text-destructive")} title="Remove" aria-label={`Remove container ${containerName}`}>
        <Trash2 className={iconClassName} />
      </button>
    </div>
  );
}
