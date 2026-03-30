const Docker = require("dockerode");
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

async function test(id) {
  const container = docker.getContainer(id);
  const info = await container.inspect();
  const stream = await container.logs({ follow: false, stdout: true, stderr: true, timestamps: true, tail: 5 });
  
  if (info.Config.Tty) {
    console.log("TTY stream");
    console.log(stream.toString("utf8"));
  } else {
    console.log("MUX stream");
    const { Writable } = require("stream");
    const outStream = new Writable({
      write(chunk, encoding, callback) {
        console.log("LINE:", chunk.toString("utf8"));
        callback();
      }
    });
    docker.modem.demuxStream(stream, outStream, outStream);
  }
}
test("dokploy").catch(console.error);
