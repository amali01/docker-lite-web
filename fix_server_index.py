with open("server/src/index.ts", "r") as f:
    text = f.read()

import_ws = "import { WebSocketServer } from 'ws';\\n"
if "WebSocketServer" not in text:
    text = text.replace('import { createServer }', import_ws + 'import { createServer }')

ws_attach = """  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const match = url.pathname.match(/^\\/api\\/containers\\/([^/]+)\\/exec$/);
    
    if (match) {
      const containerId = match[1];
      const cols = parseInt(url.searchParams.get('cols') || '80', 10);
      const rows = parseInt(url.searchParams.get('rows') || '24', 10);

      wss.handleUpgrade(request, socket, head, async (ws) => {
        try {
          const { stream, exec } = await backend.execContainer(containerId, cols, rows);
          
          ws.on('message', (msg) => {
            if (typeof msg === 'string') {
              try {
                const payload = JSON.parse(msg);
                if (payload.type === 'resize') {
                  exec.resize({ w: payload.cols, h: payload.rows }).catch(() => {});
                  return;
                }
              } catch (e) {
                // ignore
              }
            }
            stream.write(msg);
          });
          
          stream.on('data', (chunk: any) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(chunk);
            }
          });
          
          stream.on('end', () => {
            ws.close();
          });
          
          ws.on('close', () => {
            stream.end();
          });
          
        } catch (error) {
          console.error("Exec error", error);
          ws.close();
        }
      });
    } else {
      socket.destroy();
    }
  });"""

if "wss.handleUpgrade" not in text:
    text = text.replace("server.listen(", ws_attach + "\\n\\n  server.listen(")
    with open("server/src/index.ts", "w") as f:
        f.write(text)

print("done")
