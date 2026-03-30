import os, re

types_files = ["src/lib/api/types.ts", "server/src/types.ts"]
for tf in types_files:
    if not os.path.exists(tf): continue
    with open(tf, 'r') as f: content = f.read()
    if "memPercent:" not in content:
        content = re.sub(
            r'(memUsage: string \| null;)', 
            r'\1\n  memPercent: number | null;\n  netIO: string | null;', 
            content
        )
        with open(tf, 'w') as f: f.write(content)

client_file = "server/src/docker/client.ts"
with open(client_file, 'r') as f: content = f.read()

# Add to mapContainerSummary return
if "memPercent: null" not in content:
    content = re.sub(
        r'(memUsage: null,)',
        r'\1\n    memPercent: null,\n    netIO: null,',
        content
    )

# Replace getStatsMap logic
old_getstats = r'(const limit = stats\.memory_stats\.limit \|\| 0;\n\s+let memUsage(.*?)\n\s+statsMap\.set\(c\.Id, \{ cpuPercent, memUsage \}\);)'
new_getstats = r'''const limit = stats.memory_stats.limit || 0;
      let memUsage: string | null = limit ? `${formatBytes(realUsage)} / ${formatBytes(limit)}` : formatBytes(realUsage);
      
      let memPercent: number | null = null;
      if (limit > 0) {
        memPercent = (realUsage / limit) * 100.0;
      }
      
      let netIO: string | null = null;
      if (stats.networks) {
        let totalRx = 0;
        let totalTx = 0;
        for (const [key, networkData] of Object.entries(stats.networks) as any) {
          totalRx += networkData.rx_bytes || 0;
          totalTx += networkData.tx_bytes || 0;
        }
        const rxMB = totalRx / (1024 * 1024);
        const txMB = totalTx / (1024 * 1024);
        netIO = `↓${rxMB.toFixed(2)} MB ,↑${txMB.toFixed(2)} MB`;
      }
      
      statsMap.set(c.Id, { cpuPercent, memUsage, memPercent, netIO });'''

if "let memPercent:" not in content:
    content = re.sub(old_getstats, new_getstats, content, flags=re.DOTALL)

# Add to listContainers mapping
if "summary.memPercent" not in content:
    content = re.sub(
        r'(if \(stats\.memUsage !== undefined\) summary\.memUsage = stats\.memUsage;)',
        r'\1\n          if (stats.memPercent !== undefined) summary.memPercent = formatPercentage(stats.memPercent);\n          if (stats.netIO !== undefined) summary.netIO = stats.netIO;',
        content
    )

with open(client_file, 'w') as f: f.write(content)
print("Backend types & logic done.")
