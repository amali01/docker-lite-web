import re

path = "src/pages/Dashboard.tsx"
with open(path, "r") as f:
    content = f.read()

# I need to find the `</tr>` that belongs to the standalone.
# It's right before `); \n } \n })\n</tbody>`

content = re.sub(
    r'(<ContainerActionButtons compact container=\{container\} logsActive=.*?/>\s*</td>\s*</tr>)',
    r'\1\n                  {expandedMonitoring[container.id] && <MonitoringRow container={container} />}\n                </Fragment>',
    content,
    count=1
)

with open(path, "w") as f:
    f.write(content)
