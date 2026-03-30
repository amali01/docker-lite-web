import Docker from "dockerode";
async function main() {
  const docker = new Docker({ socketPath: '/var/run/docker.sock' });
  const containers = await docker.listContainers();
  if (containers.length > 0) {
    const start = Date.now();
    const stats = await docker.getContainer(containers[0].Id).stats({ stream: false });
    console.log("Took:", Date.now() - start, "ms");
    console.log("Memory:", stats.memory_stats?.usage, "/", stats.memory_stats?.limit);
    console.log("CPU:", stats.cpu_stats?.cpu_usage?.total_usage, "Pre:", stats.precpu_stats?.cpu_usage?.total_usage);
  }
}
main();
