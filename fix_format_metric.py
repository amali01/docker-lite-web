import re

def rewrite_file(filepath, callback):
    with open(filepath, 'r') as f:
        content = f.read()
    new_content = callback(content)
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)

def dashboard_metric(content):
    search = """function formatMetric(value: string | number | null) {
  if (value == null || value === "") return "—";
  return value;
}"""
    replace = """function formatMetric(value: string | number | null) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return `${value}%`;
  return value;
}"""
    return content.replace(search, replace)

def containers_metric(content):
    # in Containers.tsx, cpuPercent is rendered like: <td className="p-3 font-mono text-muted-foreground">{container.cpuPercent ?? "—"}</td>
    content = re.sub(r'\{container\.cpuPercent \?\? "—"\}', r'{container.cpuPercent != null ? `${container.cpuPercent}%` : "—"}', content)
    return content

rewrite_file("src/pages/Dashboard.tsx", dashboard_metric)
rewrite_file("src/pages/Containers.tsx", containers_metric)
print("Updated metric formatting")
