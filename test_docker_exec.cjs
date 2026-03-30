const Docker = require('dockerode');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

async function run() {
    const list = await docker.listContainers();
    if(list.length > 0) {
        const id = list[0].Id;
        console.log("container", id);
        const container = docker.getContainer(id);
        const exec = await container.exec({
            Cmd: ['/bin/sh'],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true
        });
        const stream = await exec.start({ stdin: true });
        stream.on('data', (d) => console.log('got data', d.toString()));
        stream.write("ls -la\n");
    }
}
run();
