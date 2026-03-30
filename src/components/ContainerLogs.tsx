import { useEffect, useRef, useState } from "react";
import { X, Download, Trash2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const MOCK_LOG_LINES = [
  { time: "2026-03-30T10:00:01Z", msg: "Starting application..." },
  { time: "2026-03-30T10:00:01Z", msg: "Loading configuration from /etc/app/config.yml" },
  { time: "2026-03-30T10:00:02Z", msg: "Connecting to database at postgres://db:5432/app" },
  { time: "2026-03-30T10:00:02Z", msg: "Database connection established" },
  { time: "2026-03-30T10:00:03Z", msg: "Initializing middleware stack" },
  { time: "2026-03-30T10:00:03Z", msg: "  ✓ CORS enabled for all origins" },
  { time: "2026-03-30T10:00:03Z", msg: "  ✓ Rate limiter: 100 req/min" },
  { time: "2026-03-30T10:00:03Z", msg: "  ✓ Body parser: 10mb limit" },
  { time: "2026-03-30T10:00:04Z", msg: "Registering routes..." },
  { time: "2026-03-30T10:00:04Z", msg: "  GET  /api/health" },
  { time: "2026-03-30T10:00:04Z", msg: "  GET  /api/v1/users" },
  { time: "2026-03-30T10:00:04Z", msg: "  POST /api/v1/users" },
  { time: "2026-03-30T10:00:04Z", msg: "  GET  /api/v1/orders" },
  { time: "2026-03-30T10:00:05Z", msg: "Server listening on 0.0.0.0:3000" },
  { time: "2026-03-30T10:00:10Z", msg: '[INFO] GET /api/health 200 2ms' },
  { time: "2026-03-30T10:00:15Z", msg: '[INFO] GET /api/v1/users 200 45ms' },
  { time: "2026-03-30T10:00:18Z", msg: '[WARN] Slow query detected: SELECT * FROM orders (320ms)' },
  { time: "2026-03-30T10:00:20Z", msg: '[INFO] POST /api/v1/users 201 12ms' },
  { time: "2026-03-30T10:00:25Z", msg: '[ERROR] Connection timeout to redis:6379, retrying...' },
  { time: "2026-03-30T10:00:27Z", msg: '[INFO] Redis connection restored' },
  { time: "2026-03-30T10:00:30Z", msg: '[INFO] GET /api/v1/orders 200 89ms' },
  { time: "2026-03-30T10:00:35Z", msg: '[INFO] Health check passed - all services green' },
];

interface ContainerLogsProps {
  containerName: string;
  onClose: () => void;
}

export function ContainerLogs({ containerName, onClose }: ContainerLogsProps) {
  const [lines, setLines] = useState(MOCK_LOG_LINES);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, paused]);

  // Simulate streaming logs
  useEffect(() => {
    if (paused) return;
    const interval = setInterval(() => {
      const msgs = [
        `[INFO] GET /api/health 200 ${Math.floor(Math.random() * 5)}ms`,
        `[INFO] GET /api/v1/users 200 ${Math.floor(Math.random() * 100)}ms`,
        `[INFO] POST /api/v1/orders 201 ${Math.floor(Math.random() * 50)}ms`,
        `[DEBUG] Cache hit ratio: ${(Math.random() * 100).toFixed(1)}%`,
        `[INFO] WebSocket connections: ${Math.floor(Math.random() * 20)}`,
      ];
      const msg = msgs[Math.floor(Math.random() * msgs.length)];
      setLines(prev => [...prev, { time: new Date().toISOString(), msg }]);
    }, 2000);
    return () => clearInterval(interval);
  }, [paused]);

  const getLineColor = (msg: string) => {
    if (msg.includes("[ERROR]")) return "text-destructive";
    if (msg.includes("[WARN]")) return "text-warning";
    if (msg.includes("[DEBUG]")) return "text-muted-foreground";
    if (msg.includes("✓")) return "text-success";
    return "text-foreground";
  };

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden" data-testid="container-logs">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
          <span className="text-xs font-mono font-medium text-foreground">
            Logs — {containerName}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">
            ({lines.length} lines)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setPaused(!paused)}
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setLines([])}
            title="Clear"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => {
              const text = lines.map(l => `${l.time} ${l.msg}`).join("\n");
              const blob = new Blob([text], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${containerName}-logs.txt`;
              a.click();
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

      {/* Log content */}
      <div
        ref={scrollRef}
        className="h-72 overflow-y-auto p-3 font-mono text-[11px] leading-5 bg-background/50"
      >
        {lines.length === 0 ? (
          <span className="text-muted-foreground">No logs available.</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="flex gap-3 hover:bg-muted/20 px-1 -mx-1 rounded-sm">
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
