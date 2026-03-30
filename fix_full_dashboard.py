import re

path = "src/pages/Dashboard.tsx"
with open(path, "r") as f:
    content = f.read()

# Import MonitoringRow
content = re.sub(
    r'import \{ StatusBadge \} from "@/components/StatusBadge";',
    'import { StatusBadge } from "@/components/StatusBadge";\nimport { MonitoringRow } from "@/components/MonitoringOptions";',
    content
)

if "Fragment" not in content[:500]:
    content = content.replace('import { useState, useMemo } from "react";', 'import { useState, useMemo, Fragment } from "react";')

content = re.sub(
    r'(const \[expandedGroups, setExpandedGroups\] = useState<Record<string, boolean>>\(\{\}\);)',
    r'\1\n  const [expandedMonitoring, setExpandedMonitoring] = useState<Record<string, boolean>>({});\n  const toggleMonitoring = (id: string) => {\n    setExpandedMonitoring((prev) => ({ ...prev, [id]: !prev[id] }));\n  };',
    content
)

# We need to change both TRs and Fragment wrappings.
# Since the file structure is predictable, let's just do text replacements.

# 1. Group Containers row
old_group_tr = '<tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">'
new_group_tr = '<Fragment key={container.id}>\n                        <tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors">'

content = content.replace(old_group_tr, new_group_tr)

# 2. Standalone Containers row
old_stand_tr = '<tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">'
new_stand_tr = '<Fragment key={container.id}>\n                  <tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">'

content = content.replace(old_stand_tr, new_stand_tr)

# 3. Handle closing of Fragments
# Both ends have this structure:
# `<td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">`
# `<ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />`
# `</td>`
# `</tr>`
#
# But for the FIRST one (group), we append `{expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}\n</Fragment>`
# For the SECOND one (standalone), we append `{expandedMonitoring[container.id] && <MonitoringRow container={container} />}\n</Fragment>`

parts = content.split('</td>\n                        </tr>')

if len(parts) >= 3:
    # index 0 is before group row end
    # index 1 is between group row end and standalone row end
    # index 2 is after standalone row end
    # index 0 might contain '</td>\n                        </tr>' if there are other matches? Wait.
    pass

# A safer approach using regex with count=1:
# Match the first `</tr>` after `new_group_tr`
pattern1 = r'(<tr key=\{container.id\} onClick=.*?isGroupItem.*?)(</tr>)'
# Actually, the file uses literal string match for the end of the TR.
group_btn_block = '''<td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                            <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                          </td>
                        </tr>'''

group_btn_replace = '''<td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                            <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                          </td>
                        </tr>
                        {expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}
                      </Fragment>'''

stand_btn_block = '''<td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                      <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                    </td>
                  </tr>'''

stand_btn_replace = '''<td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
                      <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
                    </td>
                  </tr>
                  {expandedMonitoring[container.id] && <MonitoringRow container={container} />}
                </Fragment>'''

content = content.replace(group_btn_block, group_btn_replace)
content = content.replace(stand_btn_block, stand_btn_replace)

with open(path, "w") as f:
    f.write(content)
