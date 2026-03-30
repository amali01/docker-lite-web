import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, Trash2, X } from "lucide-react";
import { createStreamUrl } from "@/lib/api/client";
import { ContainerLogLine, ContainerLogsChunk } from "@/lib/api/types";
import { Button } from "@/components/ui/button";

interface ContainerLogsProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export function ContainerLogs({ containerId, containerName, onClose }: ContainerLogsProps) {
  const [lines, setLines] = useState<ContainerLogLine[]>([]);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) {
      return;
    }

    const eventSource = new EventSource(createStreamUrl(`/api/containers/${containerId}/logs/stream`));

    const handleMessage = (event: MessageEvent<string>) => {
      const chunk = JSON.parse(event.data) as ContainerLogsChunk;
      setLines((previous) => [...previous, ...chunk.lines]);
    };

    eventSource.addEventListener("log", handleMessage as EventListener);

    return () => {
      eventSource.removeEventListener("log", handleMessage as EventListener);
      eventSource.close();
    };
  }, [containerId, paused]);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const getLineColor = (msg: string) => {
    if (msg.includes("[ERROR]")) return "text-destructive";
    if (msg.includes("[WARN]")) return "text-warning";
    if (msg.includes("[DEBUG]")) return "text-muted-foreground";
    if (msg.includes("✓")) return "text-success";
    return "text-foreground";
  };

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden" data-testid="container-logs">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
          <span className="text-xs font-mono font-medium text-foreground">Logs — {containerName}</span>
          <span className="text-[10px] font-mono text-muted-foreground">({lines.length} lines)</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setPaused((current) => !current)}
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setLines([])} title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              const text = lines.map((line) => `${line.time} ${line.msg}`).join("\n");
              const blob = new Blob([text], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `${containerName}-logs.txt`;
              anchor.click();
              URL.revokeObjectURL(url);
            }}
            title="Download"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose} title="Close">
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="h-72 overflow-y-auto p-3 font-mono text-[11px] leading-5 bg-background/50">
        {lines.length === 0 ? (
          <span className="text-muted-foreground">Waiting for logs...</span>
        ) : (
          lines.map((line, index) => (
            <div key={`${line.time}-${index}`} className="flex gap-3 hover:bg-muted/20 px-1 -mx-1 rounded-sm">
              <span className="text-muted-foreground shrink-0 select-none tabular-nums">
                {new Date(line.time).toLocaleTimeString()}
              </span>
              <span className={getLineColor(line.msg)}>{line.msg}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
