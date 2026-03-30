import { Box, HardDrive, Image, Network, Cpu, MemoryStick, Server } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { mockContainers, mockImages, mockVolumes, mockNetworks, mockSystemInfo } from "@/lib/mock-data";

export default function Dashboard() {
  const running = mockContainers.filter(c => c.status === 'running').length;
  const stopped = mockContainers.filter(c => c.status === 'stopped').length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Docker Engine v{mockSystemInfo.dockerVersion} • API v{mockSystemInfo.apiVersion}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Containers" value={mockContainers.length} icon={Box} subtitle={`${running} running, ${stopped} stopped`} accent />
        <StatCard label="Images" value={mockImages.length} icon={Image} subtitle="1.35 GB total" />
        <StatCard label="Volumes" value={mockVolumes.length} icon={HardDrive} subtitle="3.96 GB used" />
        <StatCard label="Networks" value={mockNetworks.length} icon={Network} subtitle={`${mockNetworks.filter(n => n.containers > 0).length} active`} />
      </div>

      {/* System Info */}
      <div className="bg-card border border-border rounded-md p-4">
        <h2 className="text-sm font-mono font-semibold mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          System Information
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div>
            <span className="text-muted-foreground block">OS / Arch</span>
            <span className="text-foreground">{mockSystemInfo.os} / {mockSystemInfo.arch}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Kernel</span>
            <span className="text-foreground">{mockSystemInfo.kernelVersion}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">CPUs</span>
            <span className="text-foreground">{mockSystemInfo.cpus} cores</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Memory</span>
            <span className="text-foreground">{mockSystemInfo.totalMemory}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Storage Driver</span>
            <span className="text-foreground">{mockSystemInfo.storageDriver}</span>
          </div>
          <div>
            <span className="text-muted-foreground block">Docker Root</span>
            <span className="text-foreground">{mockSystemInfo.rootDir}</span>
          </div>
        </div>
      </div>

      {/* Running Containers */}
      <div className="bg-card border border-border rounded-md">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-mono font-semibold flex items-center gap-2">
            <Box className="w-4 h-4 text-primary" />
            Containers
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Image</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">CPU</th>
                <th className="text-left p-3">Memory</th>
                <th className="text-left p-3">Ports</th>
              </tr>
            </thead>
            <tbody>
              {mockContainers.map((c) => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-mono font-medium text-foreground">{c.name}</td>
                  <td className="p-3 font-mono text-muted-foreground">{c.image}</td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                  <td className="p-3 font-mono text-muted-foreground">{c.cpuPercent}%</td>
                  <td className="p-3 font-mono text-muted-foreground">{c.memUsage}</td>
                  <td className="p-3 font-mono text-muted-foreground text-[11px]">{c.ports || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
