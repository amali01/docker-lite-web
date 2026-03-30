import re

with open('src/pages/Containers.tsx', 'r') as f: c_code = f.read()

# Replace <ContainerActionButtons container={container} ... />
# Note that we have 2 occurrences, one is inside the compose loop, one is standalone loop.

bt_code = """<div className="flex items-center justify-end gap-1">
                              <button onClick={() => toggleMonitoring(container.id)} className={`p-1.5 rounded transition-colors ${expandedMonitoring[container.id] ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"}`} title="Monitoring Options">
                                <Activity className="w-3.5 h-3.5" />
                              </button>
                              \\1
                            </div>"""

c_code = re.sub(r'(<ContainerActionButtons\s+container=\{container\}\s+logsActive=\{.*?/>)', bt_code, c_code, flags=re.DOTALL)

with open('src/pages/Containers.tsx', 'w') as f: f.write(c_code)
