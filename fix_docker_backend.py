with open("server/src/types.ts", "r") as f:
    text = f.read()

if "execContainer" not in text:
    text = text.replace("removeNetwork(id: string): Promise<void>;", "removeNetwork(id: string): Promise<void>;\\n  execContainer(id: string, cols: number, rows: number): Promise<any>;")
    with open("server/src/types.ts", "w") as f:
        f.write(text)

with open("server/src/engine-controller.ts", "r") as f:
    text = f.read()

if "async execContainer" not in text:
    text = text.replace("async removeNetwork(id: string) {", "async execContainer(id: string, cols: number, rows: number) {\\n    return (await this.currentBackend()).execContainer(id, cols, rows);\\n  }\\n  async removeNetwork(id: string) {")
    with open("server/src/engine-controller.ts", "w") as f:
        f.write(text)

with open("server/src/docker/client.ts", "r") as f:
    text = f.read()

if "async execContainer" not in text:
    mock_append = """
    async execContainer(id: string, cols: number, rows: number) {
      throw new Error("Exec not supported in mock adapter");
    },
"""
    real_append = """
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
"""
    
    # replace mock
    text = text.replace("async removeNetwork(id: string) {}", mock_append.strip() + "\\n    async removeNetwork(id: string) {}")
    # replace real
    text = text.replace("async removeNetwork(id: string) {\\n      await docker.getNetwork(id).remove();\\n    },", real_append.strip() + "\\n    async removeNetwork(id: string) {\\n      await docker.getNetwork(id).remove();\\n    },")
    with open("server/src/docker/client.ts", "w") as f:
        f.write(text)

print("done")
