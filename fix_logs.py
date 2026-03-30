import re

with open("server/src/docker/client.ts", "r") as f:
    orig = f.read()

logs_func = """    async subscribeToContainerLogs(id, onChunk) {
      try {
        const container = docker.getContainer(id);
        const info = await container.inspect();
        const stream = await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          timestamps: true,
          tail: 500
        });

        const handleStringData = (text: string) => {
          const lines = text
            .split("\\n")
            .filter(Boolean)
            .map((line) => {
              const firstSpace = line.indexOf(" ");
              return {
                time: firstSpace === -1 ? new Date().toISOString() : line.slice(0, firstSpace),
                msg: firstSpace === -1 ? line : line.slice(firstSpace + 1),
              };
            });

          if (lines.length > 0) {
            onChunk({ containerId: id, lines });
          }
        };

        if (info.Config.Tty) {
          (stream as NodeJS.ReadableStream).on("data", (chunk: Buffer) => handleStringData(chunk.toString("utf8")));
        } else {
          const { Writable } = require("stream");
          const outStream = new Writable({
            write(chunk: Buffer, encoding: string, callback: () => void) {
              handleStringData(chunk.toString("utf8"));
              callback();
            }
          });
          docker.modem.demuxStream(stream, outStream, outStream);
        }

        (stream as NodeJS.ReadableStream).on("error", (error: any) => {
          onChunk({
            containerId: id,
            lines: [{ time: new Date().toISOString(), msg: `[ERROR] ${error.message}` }],
          });
        });

        return async () => {
          if (typeof (stream as any).destroy === "function") {
            (stream as any).destroy();
          }
        };
      } catch (error: any) {
        onChunk({
          containerId: id,
          lines: [{ time: new Date().toISOString(), msg: `[ERROR] ${error.message}` }],
        });
        return async () => {};
      }
    },"""

orig = re.sub(r'async subscribeToContainerLogs\(id, onChunk\) \{.*?(?=async listImages)', logs_func + "\n    ", orig, flags=re.DOTALL)

with open("server/src/docker/client.ts", "w") as f:
    f.write(orig)
