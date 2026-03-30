import re

def rewrite_file(filepath, callback):
    with open(filepath, 'r') as f:
        content = f.read()
    new_content = callback(content)
    with open(filepath, 'w') as f:
        f.write(new_content)

def backend_stats(content):
    if "async function getStatsMap" not in content:
        # Add a helper function at the top of the file
        stats_helper = """
import { formatBytes, formatPercentage } from "../format";

async function getStatsMap(runningContainers: any[], docker: any) {
  const statsMap = new Map();
  await Promise.all(runningContainers.map(async (c) => {
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
      let memUsage = limit ? `${formatBytes(realUsage)} / ${formatBytes(limit)}` : formatBytes(realUsage);
      
      statsMap.set(c.Id, { cpuPercent, memUsage });
    } catch (e) {
      // ignore errors for dead containers
    }
  }));
  return statsMap;
}
"""
        content = content.replace('import { DockerBackend }', stats_helper + '\nimport { DockerBackend }')
        
    # Find `async listContainers`
    search_str = """    async listContainers() {
      try {
        const containers = await docker.listContainers({ all: true });
        return containers.map((container) =>
          mapContainerSummary({"""
    
    replace_str = """    async listContainers() {
      try {
        const containers = await docker.listContainers({ all: true });
        const runningContainers = containers.filter(c => c.State === "running");
        const statsMap = await getStatsMap(runningContainers, docker);
        
        return containers.map((container) => {
          const stats = statsMap.get(container.Id) || {};
          const summary = mapContainerSummary({"""
    
    if search_str in content:
        content = content.replace(search_str, replace_str)
        # also replace the closing brace mapping inside listContainers map
        # we need to inject stats
        
        content = content.replace("""            createdAt: formatUnixDate(container.Created),
          }),
        );
      }""", """            createdAt: formatUnixDate(container.Created),
          });
          if (stats.cpuPercent !== undefined) summary.cpuPercent = formatPercentage(stats.cpuPercent);
          if (stats.memUsage !== undefined) summary.memUsage = stats.memUsage;
          return summary;
        });
      }""")
    return content

rewrite_file("server/src/docker/client.ts", backend_stats)
print("patched client.ts")
