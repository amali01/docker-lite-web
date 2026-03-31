import type {
  ContainerDetails,
  ContainerSummary,
  EngineInfo,
  ImageSummary,
  NetworkSummary,
  VolumeSummary,
} from "@/lib/api/types";

export const mockContainers: ContainerSummary[] = [
  { id: "a1b2c3d4e5f6", name: "nginx-proxy", image: "nginx:alpine", composeProject: null, composeService: null, status: "running", state: "Up 3 hours", ports: "0.0.0.0:80->80/tcp, 443/tcp", created: "2026-03-28T10:00:00Z", cpuPercent: 0.12, memUsage: "24.5 MiB", memPercent: 4.79, memLimit: "512 MiB", netIO: "1.2 MB / 840 KB", blockIO: "12 MB / 4 KB" },
  { id: "b2c3d4e5f6g7", name: "postgres-db", image: "postgres:16", composeProject: "app-stack", composeService: "postgres", status: "running", state: "Up 2 days", ports: "0.0.0.0:5432->5432/tcp", created: "2026-03-26T08:30:00Z", cpuPercent: 1.45, memUsage: "128 MiB", memPercent: 12.5, memLimit: "1 GiB", netIO: "45 MB / 12 MB", blockIO: "890 MB / 234 MB" },
  { id: "c3d4e5f6g7h8", name: "redis-cache", image: "redis:7-alpine", composeProject: "app-stack", composeService: "redis", status: "running", state: "Up 2 days", ports: "0.0.0.0:6379->6379/tcp", created: "2026-03-26T08:30:00Z", cpuPercent: 0.03, memUsage: "8.2 MiB", memPercent: 3.2, memLimit: "256 MiB", netIO: "12 MB / 8 MB", blockIO: "2 MB / 512 KB" },
  { id: "d4e5f6g7h8i9", name: "api-server", image: "node:20-slim", composeProject: "app-stack", composeService: "api", status: "running", state: "Up 1 hour", ports: "0.0.0.0:3000->3000/tcp", created: "2026-03-30T07:00:00Z", cpuPercent: 3.21, memUsage: "210 MiB", memPercent: 41.02, memLimit: "512 MiB", netIO: "890 KB / 2.1 MB", blockIO: "45 MB / 12 MB" },
  { id: "e5f6g7h8i9j0", name: "worker-queue", image: "python:3.12-slim", composeProject: null, composeService: null, status: "stopped", state: "Exited (0) 5 min ago", ports: "", created: "2026-03-29T15:00:00Z", cpuPercent: 0, memUsage: "0 B", memPercent: 0, memLimit: "256 MiB", netIO: "0 B / 0 B", blockIO: "0 B / 0 B" },
  { id: "f6g7h8i9j0k1", name: "monitoring", image: "grafana/grafana:latest", composeProject: null, composeService: null, status: "paused", state: "Paused", ports: "0.0.0.0:3001->3000/tcp", created: "2026-03-27T12:00:00Z", cpuPercent: 0, memUsage: "95 MiB", memPercent: 18.55, memLimit: "512 MiB", netIO: "23 MB / 5 MB", blockIO: "120 MB / 45 MB" },
];

function buildContainerDetails(summary: ContainerSummary, detail: Pick<ContainerDetails, "mounts" | "ports" | "labels" | "inspect" | "stats">): ContainerDetails {
  return {
    summary,
    mounts: detail.mounts,
    ports: detail.ports,
    labels: detail.labels,
    inspect: detail.inspect,
    stats: detail.stats,
  };
}

export const mockContainerDetails: Record<string, ContainerDetails> = {
  [mockContainers[0].id]: buildContainerDetails(mockContainers[0], {
    mounts: [
      { source: "/srv/nginx/conf", destination: "/etc/nginx/conf.d", type: "bind", readOnly: false, propagation: "rprivate" },
      { source: "nginx-cache", destination: "/var/cache/nginx", type: "volume", readOnly: false, propagation: null },
    ],
    ports: [
      { ip: "0.0.0.0", privatePort: 80, publicPort: 80, protocol: "tcp" },
      { ip: null, privatePort: 443, publicPort: null, protocol: "tcp" },
    ],
    labels: [
      { key: "com.docker.compose.project", value: "edge-gateway" },
      { key: "com.docker.compose.service", value: "proxy" },
      { key: "maintainer", value: "docklite" },
    ],
    inspect: {
      raw: {
        Id: mockContainers[0].id,
        Name: `/${mockContainers[0].name}`,
        Config: {
          Image: mockContainers[0].image,
          Labels: {
            "com.docker.compose.project": "edge-gateway",
            "com.docker.compose.service": "proxy",
            maintainer: "docklite",
          },
        },
        Mounts: [
          { Source: "/srv/nginx/conf", Destination: "/etc/nginx/conf.d", Type: "bind", RW: true, Propagation: "rprivate" },
          { Source: "nginx-cache", Destination: "/var/cache/nginx", Type: "volume", RW: true, Propagation: "" },
        ],
        NetworkSettings: {
          Ports: {
            "80/tcp": [{ HostIp: "0.0.0.0", HostPort: "80" }],
            "443/tcp": [null],
          },
        },
      },
    },
    stats: [
      { sampledAt: "2026-03-31T09:58:00Z", cpuPercent: 0.08, memoryUsageBytes: 25690112, memoryLimitBytes: 536870912 },
      { sampledAt: "2026-03-31T09:59:00Z", cpuPercent: 0.12, memoryUsageBytes: 25784320, memoryLimitBytes: 536870912 },
    ],
  }),
  [mockContainers[1].id]: buildContainerDetails(mockContainers[1], {
    mounts: [
      { source: "postgres-data", destination: "/var/lib/postgresql/data", type: "volume", readOnly: false, propagation: null },
    ],
    ports: [{ ip: "0.0.0.0", privatePort: 5432, publicPort: 5432, protocol: "tcp" }],
    labels: [
      { key: "com.docker.compose.project", value: "app-stack" },
      { key: "com.docker.compose.service", value: "postgres" },
    ],
    inspect: {
      raw: {
        Id: mockContainers[1].id,
        Name: `/${mockContainers[1].name}`,
        Config: {
          Image: mockContainers[1].image,
          Labels: {
            "com.docker.compose.project": "app-stack",
            "com.docker.compose.service": "postgres",
          },
        },
        Mounts: [
          { Source: "postgres-data", Destination: "/var/lib/postgresql/data", Type: "volume", RW: true, Propagation: "" },
        ],
      },
    },
    stats: [
      { sampledAt: "2026-03-31T09:58:00Z", cpuPercent: 1.31, memoryUsageBytes: 134217728, memoryLimitBytes: 1073741824 },
      { sampledAt: "2026-03-31T09:59:00Z", cpuPercent: 1.45, memoryUsageBytes: 135266304, memoryLimitBytes: 1073741824 },
    ],
  }),
  [mockContainers[2].id]: buildContainerDetails(mockContainers[2], {
    mounts: [
      { source: "redis-data", destination: "/data", type: "volume", readOnly: false, propagation: null },
    ],
    ports: [{ ip: "0.0.0.0", privatePort: 6379, publicPort: 6379, protocol: "tcp" }],
    labels: [
      { key: "com.docker.compose.project", value: "app-stack" },
      { key: "com.docker.compose.service", value: "redis" },
    ],
    inspect: {
      raw: {
        Id: mockContainers[2].id,
        Name: `/${mockContainers[2].name}`,
        Config: {
          Image: mockContainers[2].image,
          Labels: {
            "com.docker.compose.project": "app-stack",
            "com.docker.compose.service": "redis",
          },
        },
      },
    },
    stats: [
      { sampledAt: "2026-03-31T09:58:00Z", cpuPercent: 0.02, memoryUsageBytes: 8262776, memoryLimitBytes: 268435456 },
      { sampledAt: "2026-03-31T09:59:00Z", cpuPercent: 0.03, memoryUsageBytes: 8306688, memoryLimitBytes: 268435456 },
    ],
  }),
  [mockContainers[3].id]: buildContainerDetails(mockContainers[3], {
    mounts: [
      { source: "api-cache", destination: "/usr/src/app/.cache", type: "volume", readOnly: false, propagation: null },
      { source: "/srv/app/logs", destination: "/var/log/app", type: "bind", readOnly: false, propagation: "rprivate" },
    ],
    ports: [{ ip: "0.0.0.0", privatePort: 3000, publicPort: 3000, protocol: "tcp" }],
    labels: [
      { key: "com.docker.compose.project", value: "app-stack" },
      { key: "com.docker.compose.service", value: "api" },
    ],
    inspect: {
      raw: {
        Id: mockContainers[3].id,
        Name: `/${mockContainers[3].name}`,
        Config: {
          Image: mockContainers[3].image,
          Labels: {
            "com.docker.compose.project": "app-stack",
            "com.docker.compose.service": "api",
          },
        },
      },
    },
    stats: [
      { sampledAt: "2026-03-31T09:58:00Z", cpuPercent: 3.05, memoryUsageBytes: 220200960, memoryLimitBytes: 536870912 },
      { sampledAt: "2026-03-31T09:59:00Z", cpuPercent: 3.21, memoryUsageBytes: 220725248, memoryLimitBytes: 536870912 },
    ],
  }),
  [mockContainers[4].id]: buildContainerDetails(mockContainers[4], {
    mounts: [
      { source: "worker-spool", destination: "/app/spool", type: "volume", readOnly: false, propagation: null },
    ],
    ports: [],
    labels: [
      { key: "com.example.role", value: "background-worker" },
    ],
    inspect: {
      raw: {
        Id: mockContainers[4].id,
        Name: `/${mockContainers[4].name}`,
        Config: {
          Image: mockContainers[4].image,
          Labels: {
            "com.example.role": "background-worker",
          },
        },
      },
    },
    stats: [
      { sampledAt: "2026-03-31T09:58:00Z", cpuPercent: 0, memoryUsageBytes: 0, memoryLimitBytes: 268435456 },
      { sampledAt: "2026-03-31T09:59:00Z", cpuPercent: 0, memoryUsageBytes: 0, memoryLimitBytes: 268435456 },
    ],
  }),
  [mockContainers[5].id]: buildContainerDetails(mockContainers[5], {
    mounts: [
      { source: "grafana-storage", destination: "/var/lib/grafana", type: "volume", readOnly: false, propagation: null },
    ],
    ports: [{ ip: "0.0.0.0", privatePort: 3000, publicPort: 3001, protocol: "tcp" }],
    labels: [
      { key: "com.example.role", value: "monitoring" },
    ],
    inspect: {
      raw: {
        Id: mockContainers[5].id,
        Name: `/${mockContainers[5].name}`,
        Config: {
          Image: mockContainers[5].image,
          Labels: {
            "com.example.role": "monitoring",
          },
        },
      },
    },
    stats: [
      { sampledAt: "2026-03-31T09:58:00Z", cpuPercent: 0, memoryUsageBytes: 99614720, memoryLimitBytes: 536870912 },
      { sampledAt: "2026-03-31T09:59:00Z", cpuPercent: 0, memoryUsageBytes: 100663296, memoryLimitBytes: 536870912 },
    ],
  }),
};

export const mockImages: ImageSummary[] = [
  { id: "sha256:a1b2c3", repository: "nginx", tag: "alpine", size: "42.5 MB", created: "2026-03-20" },
  { id: "sha256:b2c3d4", repository: "postgres", tag: "16", size: "412 MB", created: "2026-03-15" },
  { id: "sha256:c3d4e5", repository: "redis", tag: "7-alpine", size: "32.1 MB", created: "2026-03-18" },
  { id: "sha256:d4e5f6", repository: "node", tag: "20-slim", size: "245 MB", created: "2026-03-22" },
  { id: "sha256:e5f6g7", repository: "python", tag: "3.12-slim", size: "155 MB", created: "2026-03-19" },
  { id: "sha256:f6g7h8", repository: "grafana/grafana", tag: "latest", size: "380 MB", created: "2026-03-25" },
  { id: "sha256:g7h8i9", repository: "ubuntu", tag: "24.04", size: "78 MB", created: "2026-03-10" },
  { id: "sha256:h8i9j0", repository: "alpine", tag: "3.19", size: "7.8 MB", created: "2026-03-12" },
];

export const mockVolumes: VolumeSummary[] = [
  { name: "postgres-data", driver: "local", mountpoint: "/var/lib/docker/volumes/postgres-data/_data", created: "2026-03-26", size: "2.1 GB", inUse: true },
  { name: "redis-data", driver: "local", mountpoint: "/var/lib/docker/volumes/redis-data/_data", created: "2026-03-26", size: "45 MB", inUse: true },
  { name: "grafana-storage", driver: "local", mountpoint: "/var/lib/docker/volumes/grafana-storage/_data", created: "2026-03-27", size: "320 MB", inUse: true },
  { name: "backup-vol", driver: "local", mountpoint: "/var/lib/docker/volumes/backup-vol/_data", created: "2026-03-20", size: "1.5 GB", inUse: false },
  { name: "temp-cache", driver: "local", mountpoint: "/var/lib/docker/volumes/temp-cache/_data", created: "2026-03-15", size: "89 MB", inUse: false },
];

export const mockNetworks: NetworkSummary[] = [
  { id: "n1a2b3c4", name: "bridge", driver: "bridge", scope: "local", subnet: "172.17.0.0/16", gateway: "172.17.0.1", containers: 2 },
  { id: "n2b3c4d5", name: "host", driver: "host", scope: "local", subnet: "", gateway: "", containers: 0 },
  { id: "n3c4d5e6", name: "none", driver: "null", scope: "local", subnet: "", gateway: "", containers: 0 },
  { id: "n4d5e6f7", name: "app-network", driver: "bridge", scope: "local", subnet: "172.20.0.0/16", gateway: "172.20.0.1", containers: 4 },
  { id: "n5e6f7g8", name: "monitoring-net", driver: "bridge", scope: "local", subnet: "172.21.0.0/16", gateway: "172.21.0.1", containers: 1 },
];

export const mockSystemInfo: EngineInfo = {
  connected: true,
  dockerVersion: "25.0.3",
  apiVersion: "1.44",
  os: "Linux",
  arch: "x86_64",
  kernelVersion: "6.5.0-44-generic",
  totalMemory: "16 GiB",
  cpus: 8,
  storageDriver: "overlay2",
  rootDir: "/var/lib/docker",
  serverTime: new Date().toISOString(),
  endpoint: "unix:///var/run/docker.sock",
};
