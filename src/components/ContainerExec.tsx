import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { X } from "lucide-react";

interface ContainerExecProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export function ContainerExec({ containerId, containerName, onClose }: ContainerExecProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: "#000000",
      },
    });
    
    const fit = new FitAddon();
    term.loadAddon(fit);
    
    term.open(terminalRef.current);
    fit.fit();

    terminalInstance.current = term;
    fitAddon.current = fit;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const baseUrl = process.env.NODE_ENV === "development" ? "localhost:9001" : window.location.host;
    const wsUrl = `${protocol}//${baseUrl}/api/containers/${containerId}/exec?cols=${term.cols}&rows=${term.rows}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }
      term.write(data);
    };

    ws.onclose = (event) => {
      term.write("\r\n\x1b[33m[Terminal connection closed]\x1b[0m\r\n");
    };

    ws.onerror = (error) => {
      term.write("\r\n\x1b[31m[Terminal connection error]\x1b[0m\r\n");
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const handleResize = () => {
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

    return () => {
      window.removeEventListener("resize", handleResize);
      ws.close();
      term.dispose();
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
