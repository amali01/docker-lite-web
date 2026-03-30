export interface Container {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'paused' | 'restarting';
  state: string;
  ports: string;
  created: string;
  cpuPercent: number;
  memUsage: string;
  memLimit: string;
  netIO: string;
  blockIO: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface Volume {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  size: string;
  inUse: boolean;
}

export interface Network {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  containers: number;
}

export const mockContainers: Container[] = [
  { id: 'a1b2c3d4e5f6', name: 'nginx-proxy', image: 'nginx:alpine', status: 'running', state: 'Up 3 hours', ports: '0.0.0.0:80->80/tcp, 443/tcp', created: '2026-03-28T10:00:00Z', cpuPercent: 0.12, memUsage: '24.5 MiB', memLimit: '512 MiB', netIO: '1.2 MB / 840 KB', blockIO: '12 MB / 4 KB' },
  { id: 'b2c3d4e5f6g7', name: 'postgres-db', image: 'postgres:16', status: 'running', state: 'Up 2 days', ports: '0.0.0.0:5432->5432/tcp', created: '2026-03-26T08:30:00Z', cpuPercent: 1.45, memUsage: '128 MiB', memLimit: '1 GiB', netIO: '45 MB / 12 MB', blockIO: '890 MB / 234 MB' },
  { id: 'c3d4e5f6g7h8', name: 'redis-cache', image: 'redis:7-alpine', status: 'running', state: 'Up 2 days', ports: '0.0.0.0:6379->6379/tcp', created: '2026-03-26T08:30:00Z', cpuPercent: 0.03, memUsage: '8.2 MiB', memLimit: '256 MiB', netIO: '12 MB / 8 MB', blockIO: '2 MB / 512 KB' },
  { id: 'd4e5f6g7h8i9', name: 'api-server', image: 'node:20-slim', status: 'running', state: 'Up 1 hour', ports: '0.0.0.0:3000->3000/tcp', created: '2026-03-30T07:00:00Z', cpuPercent: 3.21, memUsage: '210 MiB', memLimit: '512 MiB', netIO: '890 KB / 2.1 MB', blockIO: '45 MB / 12 MB' },
  { id: 'e5f6g7h8i9j0', name: 'worker-queue', image: 'python:3.12-slim', status: 'stopped', state: 'Exited (0) 5 min ago', ports: '', created: '2026-03-29T15:00:00Z', cpuPercent: 0, memUsage: '0 B', memLimit: '256 MiB', netIO: '0 B / 0 B', blockIO: '0 B / 0 B' },
  { id: 'f6g7h8i9j0k1', name: 'monitoring', image: 'grafana/grafana:latest', status: 'paused', state: 'Paused', ports: '0.0.0.0:3001->3000/tcp', created: '2026-03-27T12:00:00Z', cpuPercent: 0, memUsage: '95 MiB', memLimit: '512 MiB', netIO: '23 MB / 5 MB', blockIO: '120 MB / 45 MB' },
];

export const mockImages: DockerImage[] = [
  { id: 'sha256:a1b2c3', repository: 'nginx', tag: 'alpine', size: '42.5 MB', created: '2026-03-20' },
  { id: 'sha256:b2c3d4', repository: 'postgres', tag: '16', size: '412 MB', created: '2026-03-15' },
  { id: 'sha256:c3d4e5', repository: 'redis', tag: '7-alpine', size: '32.1 MB', created: '2026-03-18' },
  { id: 'sha256:d4e5f6', repository: 'node', tag: '20-slim', size: '245 MB', created: '2026-03-22' },
  { id: 'sha256:e5f6g7', repository: 'python', tag: '3.12-slim', size: '155 MB', created: '2026-03-19' },
  { id: 'sha256:f6g7h8', repository: 'grafana/grafana', tag: 'latest', size: '380 MB', created: '2026-03-25' },
  { id: 'sha256:g7h8i9', repository: 'ubuntu', tag: '24.04', size: '78 MB', created: '2026-03-10' },
  { id: 'sha256:h8i9j0', repository: 'alpine', tag: '3.19', size: '7.8 MB', created: '2026-03-12' },
];

export const mockVolumes: Volume[] = [
  { name: 'postgres-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/postgres-data/_data', created: '2026-03-26', size: '2.1 GB', inUse: true },
  { name: 'redis-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/redis-data/_data', created: '2026-03-26', size: '45 MB', inUse: true },
  { name: 'grafana-storage', driver: 'local', mountpoint: '/var/lib/docker/volumes/grafana-storage/_data', created: '2026-03-27', size: '320 MB', inUse: true },
  { name: 'backup-vol', driver: 'local', mountpoint: '/var/lib/docker/volumes/backup-vol/_data', created: '2026-03-20', size: '1.5 GB', inUse: false },
  { name: 'temp-cache', driver: 'local', mountpoint: '/var/lib/docker/volumes/temp-cache/_data', created: '2026-03-15', size: '89 MB', inUse: false },
];

export const mockNetworks: Network[] = [
  { id: 'n1a2b3c4', name: 'bridge', driver: 'bridge', scope: 'local', subnet: '172.17.0.0/16', gateway: '172.17.0.1', containers: 2 },
  { id: 'n2b3c4d5', name: 'host', driver: 'host', scope: 'local', subnet: '', gateway: '', containers: 0 },
  { id: 'n3c4d5e6', name: 'none', driver: 'null', scope: 'local', subnet: '', gateway: '', containers: 0 },
  { id: 'n4d5e6f7', name: 'app-network', driver: 'bridge', scope: 'local', subnet: '172.20.0.0/16', gateway: '172.20.0.1', containers: 4 },
  { id: 'n5e6f7g8', name: 'monitoring-net', driver: 'bridge', scope: 'local', subnet: '172.21.0.0/16', gateway: '172.21.0.1', containers: 1 },
];

export const mockSystemInfo = {
  dockerVersion: '25.0.3',
  apiVersion: '1.44',
  os: 'Linux',
  arch: 'x86_64',
  kernelVersion: '6.5.0-44-generic',
  totalMemory: '16 GiB',
  cpus: 8,
  storageDriver: 'overlay2',
  rootDir: '/var/lib/docker',
  serverTime: new Date().toISOString(),
};
