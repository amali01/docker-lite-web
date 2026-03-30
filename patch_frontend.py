import os, re

def truncate_string(var_name):
    # Ensure name length <= 20 chars
    # Wait, the code doesn't define truncateNameWith20 in the file yet, let's just inline it
    return f"{{(typeof {var_name} === 'string' && {var_name}.length > 20) ? {var_name}.substring(0, 20) + '…' : {var_name}}}"

# 1. Containers.tsx text truncation, metrics expansion and prefix removal
containers_file = "src/pages/Containers.tsx"
with open(containers_file, 'r') as f: content = f.read()

# Expand headers
if "Mem %" not in content:
    content = content.replace('<th className="text-left p-3">Mem</th>', '<th className="text-left p-3">Mem</th>\n                <th className="text-left p-3">Mem %</th>\n                <th className="text-left p-3">NetIO</th>')

# Add 2 columns of dashes for parents
if "<!-- extra columns -->" not in content and '<td className="p-3 font-mono text-muted-foreground">—</td>' in content:
    # Under CPU and Mem are two dashes. Let's add two more for Mem% and NetIO.
    # Actually just simple regex replace for the sequence
    dash_col_pattern = r'(<td className="p-3 font-mono text-muted-foreground">—</td>\n\s+<td className="p-3 font-mono text-muted-foreground">—</td>\n\s+)(<td className="p-3 font-mono text-muted-foreground text-\[11px\]">—</td>)'
    content = re.sub(dash_col_pattern, r'\1<td className="p-3 font-mono text-muted-foreground">—</td>\n                        <td className="p-3 font-mono text-muted-foreground">—</td>\n                        \2', content)

# Expand rows
if "{container.memPercent" not in content:
    row_pattern = r'(<td className="p-3 font-mono text-muted-foreground">\{container\.memUsage \?\? "—"\}</td>)'
    content = re.sub(row_pattern, r'\1\n                    <td className="p-3 font-mono text-muted-foreground">{container.memPercent ? `${container.memPercent.toFixed(1)}%` : "—"}</td>\n                    <td className="p-3 font-mono text-muted-foreground">{container.netIO ?? "—"}</td>', content)

# Standalone name (around line 554)
content = re.sub(
    r'(className="font-mono font-medium text-foreground[^"]*"[^>]*>\s*)\{container\.name\}',
    r'\1{(typeof container.name === "string" && container.name.length > 20) ? container.name.substring(0, 20) + "…" : container.name}',
    content
)
# Compose name
content = re.sub(
    r'(className="font-mono font-medium text-foreground[^"]*"[^>]*>\s*)\{container\.name\}',
    r'\1{(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}',
    content,
    count=1 # Match the first one (compose stack one)
)
# All image names (Containers)
content = re.sub(
    r'(className="max-w-\[8\.5rem\][^"]*"[^>]*>\s*)\{container\.image\}',
    r'\1{(typeof container.image === "string" && container.image.length > 20) ? container.image.substring(0, 20) + "…" : container.image}',
    content
)

# Compose Stack repetitive text removal
content = content.replace('Compose Stack • {entry.containers.length} containers', '{entry.containers.length} containers')
content = content.replace('Compose Stack • {entry.images.length} images', '{entry.images.length} images')
content = content.replace('Compose Stack • {entry.volumes.length} volumes', '{entry.volumes.length} volumes')
content = content.replace('Compose Stack • {entry.networks.length} networks', '{entry.networks.length} networks')

with open(containers_file, 'w') as f: f.write(content)

# 2. Fix UI classes across files
files = ["src/pages/Containers.tsx", "src/pages/Images.tsx", "src/pages/Volumes.tsx", "src/pages/Networks.tsx", "src/pages/Dashboard.tsx"]
for filename in files:
    if not os.path.exists(filename): continue
    with open(filename, 'r') as f: content = f.read()

    # Py-1.5 to h-9 py-0
    content = content.replace('py-1.5', 'h-9 py-0')

    # Sticky Action Headers
    content = content.replace('sticky right-0 bg-card', 'sticky right-0 bg-card z-20 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l')

    # Sticky Action Cells
    content = content.replace('sticky right-0 bg-muted/20', 'sticky right-0 bg-muted/20 z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted/30 transition-colors')
    content = content.replace('sticky right-0 bg-card group-hover:bg-muted/30', 'sticky right-0 bg-card z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted/30 transition-colors')

    with open(filename, 'w') as f: f.write(content)

# 3. Settings file monitor block
settings = "src/pages/DockerSettings.tsx"
with open(settings, 'r') as f: content = f.read()

if "Monitoring Options" not in content:
    mon_block = """
      <div className="bg-card border border-border rounded-md p-5 space-y-4 mb-6">
        <h2 className="text-sm font-mono font-semibold flex items-center gap-2">
          Monitoring Options
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono">Enable Monitoring</span>
            <input type="checkbox" className="toggle w-10 h-5" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono">Auto-Restart on failure</span>
            <input type="checkbox" className="toggle w-10 h-5" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono">Monitor Logs</span>
            <input type="checkbox" className="toggle w-10 h-5" defaultChecked />
          </div>
          <div>
            <label className="text-xs font-mono text-muted-foreground block mb-1">Log Patterns (comma separated)</label>
            <input type="text" className="w-full bg-background border border-border rounded h-9 px-3 text-sm font-mono" defaultValue="error,panic,fatal,exception" />
          </div>
        </div>
      </div>
"""
    content = content.replace('<div className="bg-card border border-border rounded-md p-5 space-y-3">\n        <h2 className="text-sm font-mono font-semibold">About DockLite</h2>', mon_block + '\n      <div className="bg-card border border-border rounded-md p-5 space-y-3">\n        <h2 className="text-sm font-mono font-semibold">About DockLite</h2>')
    with open(settings, 'w') as f: f.write(content)

# 4. Image truncate for Images.tsx
images_file = "src/pages/Images.tsx"
if os.path.exists(images_file):
    with open(images_file, 'r') as f: content = f.read()
    content = re.sub(
        r'<ImageIcon className="w-3\.5 h-3\.5 text-primary" />\s*\{image\.repository\}',
        r'<ImageIcon className="w-3.5 h-3.5 text-primary" /> <span style={{maxWidth:"20ch",display:"inline-block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={image.repository}>{image.repository}</span>',
        content
    )
    with open(images_file, 'w') as f: f.write(content)

print("Frontend patch completed successfully!")
