def safe_replace(filepath, search, replace):
    with open(filepath, "r") as f:
        text = f.read()
    if search in text:
        text = text.replace(search, replace)
        with open(filepath, "w") as f:
            f.write(text)

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
    async removeNetwork(id) {
"""

mock_client = """
    async execContainer(id: string, cols: number, rows: number) {
      throw new Error("Exec not supported in mock adapter");
    },
    async removeNetwork(id) {}
"""
safe_replace("server/src/docker/client.ts", "async removeNetwork(id) {\\n      await docker.getNetwork(id).remove();\\n    },", real_client.strip() + "\\n      await docker.getNetwork(id).remove();\\n    },")
safe_replace("server/src/docker/client.ts", "async removeNetwork(id) {}", mock_client.strip())
safe_replace("server/src/index.ts", "backend.execContainer", "engineController.execContainer")

