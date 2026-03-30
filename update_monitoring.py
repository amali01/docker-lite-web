import re
import os

# 1. Remove Monitoring Options from DockerSettings.tsx
settings_path = 'src/pages/DockerSettings.tsx'
with open(settings_path, 'r') as f:
    settings_code = f.read()

# We look for the <div className="bg-card border border-border rounded-md p-5 space-y-4 mb-6">...Monitoring Options...</div>
settings_patch = re.sub(
    r'<div className="bg-card border border-border rounded-md p-5 space-y-4 mb-6">\s*<h2 className="text-sm font-mono font-semibold flex items-center gap-2">.*?</div>\s*</div>\s*<div className="bg-card',
    '<div className="bg-card',
    settings_code,
    flags=re.DOTALL
)
with open(settings_path, 'w') as f:
    f.write(settings_patch)

# 2. Add state and import to Containers.tsx
containers_path = 'src/pages/Containers.tsx'
with open(containers_path, 'r') as f:
    c_code = f.read()

# Add Activity to icons
c_code = re.sub(r'import\s+\{([^}]+)\}\s+from\s+"lucide-react";', lambda m: f'import {{{m.group(1).replace(" ", " ")}, Activity}} from "lucide-react";', c_code)

# Add expandedMonitoring state
state_code = """
  const [expandedMonitoring, setExpandedMonitoring] = useState<Record<string, boolean>>({});
  const toggleMonitoring = (id: string) => {
    setExpandedMonitoring(prev => ({ ...prev, [id]: !prev[id] }));
  };
"""
c_code = re.sub(r'(const\s+\[filter,\s*setFilter\]\s*=\s*useState[^;]+;)', r'\1' + state_code, c_code)

monitoring_row = """
                  {expandedMonitoring[container.id] && (
                    <tr className="bg-muted/10 border-b border-border/50">
                      <td colSpan={10} className="p-4">
                        <div className="max-w-xl mx-auto bg-card border border-border rounded-md p-5 space-y-4">
                          <h2 className="text-sm font-mono font-semibold flex items-center gap-2 text-primary">
                            <Activity className="w-4 h-4" /> Monitoring Options
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
                      </td>
                    </tr>
                  )}
"""

# Now we need to modify the rendering of rows.
# There are two places where rows are rendered:
# A) Standalone containers:
# `return (`
# `  <tr key={container.id} ...`
# we need to replace it with `<Fragment key={container.id}> <tr ...`
# and add `monitoring_row` before `</Fragment>`

# 1st replacement: standalone containers A
c_code = re.sub(
    r'(<tr key=\{container\.id\} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">.*?</ContainerActionButtons>\s*</div>\s*</td>\s*</tr>)',
    r'<Fragment key={container.id}>\n\1' + monitoring_row + r'\n</Fragment>',
    c_code,
    flags=re.DOTALL
)

# However, wait! I need to add the toggle button to the actions cell.
# The actions cell:
# <div className="flex items-center justify-end gap-1">
#   <ContainerActionButtons ... />
# </div>
#
# I will add an Activity button before ContainerActionButtons.
action_btn = """
                          <button onClick={() => toggleMonitoring(container.id)} className={`p-1.5 rounded hover:bg-muted ${expandedMonitoring[container.id] ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`} title="Monitoring Options"><Activity className="w-4 h-4" /></button>
"""

c_code = re.sub(
    r'(<div className="flex items-center justify-end gap-1">\s*)(<ContainerActionButtons)',
    r'\1' + action_btn + r'\2',
    c_code
)

with open(containers_path, 'w') as f:
    f.write(c_code)
print("Patch applied")
