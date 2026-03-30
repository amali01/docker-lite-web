with open("server/src/docker/client.ts", "r") as f:
    text = f.read()

mock_replace = """    async removeNetwork(id) {
"""

mock_with_exec = """    async execContainer(id: string, cols: number, rows: number) {
      throw new Error("Exec not supported in mock adapter");
    },
    async removeNetwork(id) {
"""

text = text.replace(mock_replace, mock_with_exec, 1)

real_replace = """    async removeNetwork(id) {
      try {
        const network = docker.getNetwork(id);"""

real_with_exec = """    async execContainer(id: string, cols: number, rows: number) {
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
      try {
        const network = docker.getNetwork(id);"""

text = text.replace(real_replace, real_with_exec, 1)

with open("server/src/docker/client.ts", "w") as f:
    f.write(text)

print("done")
