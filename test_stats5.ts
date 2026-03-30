import Docker from "dockerode";
const docker = new Docker({ socketPath: '/var/run/docker.sock' });
async function main() {
  const containers = await docker.listContainers();
  if (containers.length > 0) {
    const promises = containers.filter(c => c.State === "running").map(async c => {
       const start = Date.now();
       const stats = await docker.getContainer(c.Id).stats({ stream: false });
       return { id: c.Id, time: Date.now() - start, stats };
    });
    const results = await Promise.all(promises);
    for (const r of results) {
       console.log(r.id, "took", r.time, "ms", r.stats.memory_stats?.usage);
    }
  }
}
main();
