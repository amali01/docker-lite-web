import { FileText, Play, RotateCcw, Square, Terminal, Trash2 } from "lucide-react";
import { ContainerSummary } from "@/lib/api/types";

interface ContainerActionButtonsProps {
  container: ContainerSummary;
  logsActive?: boolean;
  onAction: (action: "start" | "stop" | "restart" | "remove" | "logs" | "terminal", container: ContainerSummary) => void;
}

export function ContainerActionButtons({ container, logsActive, onAction }: ContainerActionButtonsProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {container.status === "stopped" ? (
        <button onClick={() => onAction("start", container)} className="p-1.5 rounded hover:bg-success/10 text-success" title="Start">
          <Play className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => onAction("stop", container)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Stop">
          <Square className="w-3.5 h-3.5" />
        </button>
      )}
      <button onClick={() => onAction("restart", container)} className="p-1.5 rounded hover:bg-primary/10 text-primary" title="Restart">
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onAction("logs", container)}
        className={`p-1.5 rounded hover:bg-muted ${logsActive ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
        title="Logs"
      >
        <FileText className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => onAction("terminal", container)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Terminal">
        <Terminal className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => onAction("remove", container)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Remove">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
