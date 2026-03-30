def safe_replace(filepath, search, replace):
    with open(filepath, "r") as f:
        text = f.read()
    if search in text:
        text = text.replace(search, replace)
        with open(filepath, "w") as f:
            f.write(text)

safe_replace("server/src/types.ts", 
             "removeNetwork(id: string): Promise<void>;", 
             "removeNetwork(id: string): Promise<void>;\n  execContainer(id: string, cols: number, rows: number): Promise<any>;")

safe_replace("server/src/engine-controller.ts",
             "async removeNetwork(id: string) {",
             "async execContainer(id: string, cols: number, rows: number) {\n    return (await this.currentBackend()).execContainer(id, cols, rows);\n  }\n  async removeNetwork(id: string) {")


real_client = """
    async execContainer(id: string, cols: number, rows: number) {
      try {
        const container = docker.getContainer(id);
        const exec = await container.exec({
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Cmd: ['sh', '-c', 'if command -v bash >/dev/null; then exec bash; else exec sh; fi'],
          Env: ['TERM=xterm'],
        });
        const stream = await exec.start({ stdin: true, hijack: true });
        if (cols && rows) {
          await exec.resize({ w: cols, h: rows });
        }
        return { stream, exec };
      } catch (error) {
        throw createBackendError(error);
      }
    },
    async removeNetwork(id: string) {
      await docker.getNetwork(id).remove();
    },
"""

mock_client = """
    async execContainer(id: string, cols: number, rows: number) {
      throw new Error("Exec not supported in mock adapter");
    },
    async removeNetwork(id: string) {}
"""

safe_replace("server/src/docker/client.ts", "async removeNetwork(id: string) {\n      await docker.getNetwork(id).remove();\n    },", real_client.strip() + ",")
safe_replace("server/src/docker/client.ts", "async removeNetwork(id: string) {}", mock_client.strip())


ws_attach = """
  const wss = new WebSocketServer({ noServer: true });

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
  });

  server.listen(
"""

safe_replace("server/src/index.ts", "import { createServer } from \"node:http\";", "import { WebSocketServer } from 'ws';\nimport { createServer } from \"node:http\";")
safe_replace("server/src/index.ts", "server.listen(", ws_attach.strip())
print("replaced safely!")
