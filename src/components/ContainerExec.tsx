import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { resolveStreamEndpoint } from "@/lib/api/client";

interface ContainerExecProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export function ContainerExec({ containerId, containerName, onClose }: ContainerExecProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    let closed = false;
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let handleResize = () => {};

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
        import("@xterm/xterm/css/xterm.css"),
      ]);

      if (closed || !terminalRef.current) {
        return;
      }

      const term = new Terminal({
        cursorBlink: true,
        theme: {
          background: "#000000",
        },
      });
      const fit = new FitAddon();

      terminal = term;
      term.loadAddon(fit);
      term.open(terminalRef.current);
      fit.fit();

      const wsUrl = resolveStreamEndpoint(`/api/containers/${containerId}/exec`, "websocket");
      wsUrl.searchParams.set("cols", String(term.cols));
      wsUrl.searchParams.set("rows", String(term.rows));
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        let data = event.data;
        if (data instanceof Blob) {
          data = await data.text();
        }
        term.write(data);
      };

      ws.onclose = () => {
        term.write("\r\n\x1b[33m[Terminal connection closed]\x1b[0m\r\n");
      };

      ws.onerror = () => {
        term.write("\r\n\x1b[31m[Terminal connection error]\x1b[0m\r\n");
      };

      const dataSubscription = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      handleResize = () => {
        try {
          fit.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          }
        } catch {
          return;
        }
      };

      window.addEventListener("resize", handleResize);

      if (closed) {
        dataSubscription.dispose();
        window.removeEventListener("resize", handleResize);
        ws.close();
        term.dispose();
      }
    })().catch(() => {
      if (!closed && terminalRef.current) {
        terminalRef.current.textContent = "Unable to start terminal.";
      }
    });

    return () => {
      closed = true;
      window.removeEventListener("resize", handleResize);
      wsRef.current?.close();
      terminal?.dispose();
    };
  }, [containerId]);

  return (
    <div className="flex flex-col h-full bg-black border-t border-border">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="font-mono text-sm text-muted-foreground">
            Terminal: <span className="text-foreground">{containerName}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors"
          title="Close terminal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden p-2" ref={terminalRef} />
    </div>
  );
}
