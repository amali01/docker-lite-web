import re

with open('src/pages/Containers.tsx', 'r') as f:
    c_code = f.read()

monitoring_row = """
                  {expandedMonitoring[container.id] && (
                    <tr className="bg-muted/10 border-b border-border/50">
                      <td colSpan={10} className="p-4 relative">
                        <div className="max-w-xl bg-card border border-border rounded-md p-5 space-y-4 shadow-sm" style={{marginLeft: "3rem"}}>
                          <h2 className="text-sm font-mono font-semibold flex items-center gap-2 text-primary">
                            <Activity className="w-4 h-4" /> Monitoring Options
                          </h2>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-mono">Enable Monitoring</span>
                              <input type="checkbox" className="toggle border border-border w-10 h-5" defaultChecked />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-mono">Auto-Restart on failure</span>
                              <input type="checkbox" className="toggle border border-border w-10 h-5" />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-mono">Monitor Logs</span>
                              <input type="checkbox" className="toggle border border-border w-10 h-5" defaultChecked />
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

c_code = re.sub(
    r'(<tr key=\{container\.id\} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">.*?onAction=\{[^\}]+\}\s*/>\s*</td>\s*</tr>)',
    r'<Fragment key={container.id}>\n\1\n' + monitoring_row + r'</Fragment>',
    c_code,
    flags=re.DOTALL
)

with open('src/pages/Containers.tsx', 'w') as f:
    f.write(c_code)
