import Docker from "dockerode";
async function main() {
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const containers = await docker.listContainers();
  if (containers.length > 0) {
    const start = Date.now();
    console.log("Fetching stats for", containers[0].Id);
    const stats: any = await docker.getContainer(containers[0].Id).stats({ stream: false });
    console.log("Took:", Date.now() - start, "ms");
    console.log(stats.memory_stats?.usage);
  }
}
main();
