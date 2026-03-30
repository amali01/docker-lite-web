import re

def fix(path):
    with open(path, "r") as f:
        text = f.read()

    # Search for: {expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}
    # Or similar
    text = re.sub(
        r'<MonitoringRow container=\{container\} isGroupItem=\{true\} />',
        r'<MonitoringRow container={container} isGroupItem={true} isLast={index === arr.length - 1} />',
        text
    )

    with open(path, "w") as f:
        f.write(text)

fix("src/pages/Containers.tsx")
fix("src/pages/Dashboard.tsx")
