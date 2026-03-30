import re
import os

def process_containers():
    path = "src/pages/Containers.tsx"
    with open(path, "r") as f:
        content = f.read()

    # Import MonitoringRow
    content = re.sub(
        r'import \{ ContainerActionButtons \} from "@/components/ContainerActionButtons";',
        'import { ContainerActionButtons } from "@/components/ContainerActionButtons";\nimport { MonitoringRow } from "@/components/MonitoringOptions";',
        content
    )

    # Find where it starts
    start_idx = content.find("const MonitoringRow = ({ container, isGroupItem = false }")
    if start_idx != -1:
        # Find exactly where it ends: "  );\n};\n"
        end_idx = content.find("};\n", content.find("  );\n", start_idx))
        if end_idx != -1:
            content = content[:start_idx] + content[end_idx + 3:]

    # Add onClick to TRs:
    content = content.replace(
        '<tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">',
        '<tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors">'
    )
    content = content.replace(
        '<tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">',
        '<tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">'
    )

    with open(path, "w") as f:
        f.write(content)


def process_dashboard():
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

    # TRs:
    content = content.replace(
        '<tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">',
        '<tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors">'
    )
    content = content.replace(
        '<tr key={container.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">',
        '<tr key={container.id} onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card">'
    )

    # Fragments Group
    content = re.sub(
        r'(entry\.containers\.map\(\(container, index, arr\) => \(\s*)<tr key=\{container\.id\} onClick',
        r'\1<Fragment key={container.id}>\n                        <tr key={container.id} onClick',
        content
    )
    content = re.sub(
        r'(<ContainerActionButtons container=\{container\} onAction=\{handleAction\} />\s*</td>\s*</tr>)',
        r'\1\n                        {expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}\n                      </Fragment>',
        content,
        count=1
    )

    # Fragments Standalone
    content = re.sub(
        r'(const container = entry\.container;\s*return \(\s*)<tr key=\{container\.id\} onClick',
        r'\1<Fragment key={container.id}>\n                  <tr key={container.id} onClick',
        content
    )
    content = re.sub(
        r'(<ContainerActionButtons container=\{container\} onAction=\{handleAction\} />\s*</td>\s*</tr>)',
        r'\1\n                  {expandedMonitoring[container.id] && <MonitoringRow container={container} />}\n                </Fragment>',
        content,
        count=1
    )

    with open(path, "w") as f:
        f.write(content)

process_containers()
process_dashboard()
