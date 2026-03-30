import re

path = "src/pages/Dashboard.tsx"
with open(path, "r") as f:
    content = f.read()

# Make sure Fragment is imported
if "Fragment" not in content:
    content = content.replace('import { useState } from "react";', 'import { useState, Fragment } from "react";')
else:
    # ensure it's imported correctly
    if "Fragment" not in content[:500]:
        content = content.replace('import { useState, useMemo } from "react";', 'import { useState, useMemo, Fragment } from "react";')

# Group containers map
# Find the start of the `tr`
# It looks like:
# {expandedGroups[entry.project] && entry.containers.map((container, index, arr) => (
#   <tr key={container.id} onClick={(e) => ...
content = re.sub(
    r'(entry\.containers\.map\(\(container, index, arr\) => \(\s*)<tr key=\{container\.id\}',
    r'\1<Fragment key={container.id}>\n                        <tr',
    content
)

# End of the group container `tr`:
# <ContainerActionButtons container={container} onAction={handleAction} /></td>
# </tr>
content = re.sub(
    r'(<ContainerActionButtons container=\{container\} onAction=\{handleAction\} />\s*</td>\s*</tr>)',
    r'\1\n                        {expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}\n                      </Fragment>',
    content,
    count=1
)

# Standalone containers
# return (
#   <tr key={container.id} onClick={(e) => ...
content = re.sub(
    r'(const container = entry\.container;\s*return \(\s*)<tr key=\{container\.id\}',
    r'\1<Fragment key={container.id}>\n                  <tr',
    content
)

content = re.sub(
    r'(<ContainerActionButtons container=\{container\} onAction=\{handleAction\} />\s*</td>\s*</tr>)',
    r'\1\n                  {expandedMonitoring[container.id] && <MonitoringRow container={container} />}\n                </Fragment>',
    content,
    count=1 # wait, the previous substitution might have hit this one too if we used count=1 initially?
            # actually let's just do a match with regex all the cases where it ends.
            # But the first ones are already replaced.
)

with open(path, "w") as f:
    f.write(content)
