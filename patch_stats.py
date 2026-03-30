with open("server/src/docker/client.ts", "r") as f:
    content = f.read()

stats_helper = """
async function getStatsMap(runningContainers: any[], docker: any) {
  const statsMap = new Map();
  await Promise.all(runningContainers.map(async (c: any) => {
    try {
      const stats = await docker.getContainer(c.Id).stats({ stream: false });
      
      let cpuPercent = 0;
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      if (systemDelta > 0 && cpuDelta > 0) {
        const numCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1;
        cpuPercent = (cpuDelta / systemDelta) * numCpus * 100.0;
      }
      
      const usage = stats.memory_stats.usage || 0;
      const cache = stats.memory_stats.stats?.cache || stats.memory_stats.stats?.inactive_file || 0;
      const realUsage = Math.max(0, usage - cache);
      const limit = stats.memory_stats.limit || 0;
      let memUsage: string | null = limit ? `${formatBytes(realUsage)} / ${formatBytes(limit)}` : formatBytes(realUsage);
      
      statsMap.set(c.Id, { cpuPercent, memUsage });
    } catch (e) {
      // ignore errors for dead containers
    }
  }));
  return statsMap;
}
"""

if "async function getStatsMap" not in content:
    content = content.replace("function mapContainerSummary", stats_helper + "\nfunction mapContainerSummary")
    with open("server/src/docker/client.ts", "w") as f:
        f.write(content)
    print("Done patching.")
else:
    print("Already inserted.")
