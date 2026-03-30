import Docker from "dockerode";
async function main() {
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const containers = await docker.listContainers();
  if (containers.length > 0) {
    console.log("Fetching stats for", containers[0].Id);
    const stats = await docker.getContainer(containers[0].Id).stats({ stream: false });
    console.log(Object.keys(stats));
    console.log("Memory usage:", stats.memory_stats?.usage);
  }
}
main();
