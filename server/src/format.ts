export function formatBytes(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  if (value === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** exponent;

  return `${size.toFixed(size >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function formatPercentage(value?: number | null) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  return Number(value.toFixed(2));
}

export function formatUnixDate(timestampSeconds?: number) {
  if (!timestampSeconds) {
    return new Date().toISOString();
  }

  return new Date(timestampSeconds * 1000).toISOString();
}

export function formatPorts(ports: Array<{ IP?: string; PublicPort?: number; PrivatePort?: number; Type?: string }> | undefined) {
  if (!ports || ports.length === 0) {
    return "";
  }

  return ports
    .map((port) => {
      if (port.PublicPort) {
        return `${port.IP || "0.0.0.0"}:${port.PublicPort}->${port.PrivatePort}/${port.Type ?? "tcp"}`;
      }

      return `${port.PrivatePort}/${port.Type ?? "tcp"}`;
    })
    .join(", ");
}

export function formatCreatedDate(createdAt: string) {
  return createdAt.slice(0, 10);
}
