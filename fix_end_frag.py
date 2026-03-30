import re

path = "src/pages/Dashboard.tsx"
with open(path, "r") as f:
    content = f.read()

# I see it injected:
# <Fragment key={container.id}>
#   <tr key={container.id} onClick=...
#
# But for the end of the `tr` for group, it's currently:
#                           <td className="sticky right-0 z-10 bg-card p-2 sm:p-3 border-l border-border/70 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] group-hover:bg-muted">
#                             <ContainerActionButtons compact container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
#                           </td>
#                         </tr>
#                       ))}
#
# I need to change:
#                           </td>
#                         </tr>
#                       ))}
# To:
#                           </td>
#                         </tr>
#                         {expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}
#                       </Fragment>
#                       ))}

content = re.sub(
    r'(<ContainerActionButtons compact container=\{container\}.*?/>\s*</td>\s*</tr>)',
    r'\1\n                        {expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}\n                      </Fragment>',
    content,
    count=1
)

# And for standalone container:
# <ContainerActionButtons container={container} logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id} onAction={(action, currentContainer) => void handleAction(action, currentContainer)} />
#   </td>
# </tr>
#
# Replace with:
#                           </td>
#                         </tr>
#                         {expandedMonitoring[container.id] && <MonitoringRow container={container} />}
#                       </Fragment>

content = re.sub(
    r'(<ContainerActionButtons container=\{container\}.*?onAction=\{\(action, currentContainer\) => void handleAction\(action, currentContainer\)\} />\s*</td>\s*</tr>)',
    r'\1\n                  {expandedMonitoring[container.id] && <MonitoringRow container={container} />}\n                </Fragment>',
    content,
    count=1
)

with open(path, "w") as f:
    f.write(content)
