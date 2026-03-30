import re
import os

files = [
    "src/pages/Dashboard.tsx",
    "src/pages/Images.tsx",
    "src/pages/Volumes.tsx",
    "src/pages/Networks.tsx",
]

# For Dashboard, the group row:
# {entry.project} -> {entry.project.length > 20 ? entry.project.substring(0, 20) + "…" : entry.project}

for file in files:
    if not os.path.exists(file): continue
    with open(file, "r") as f:
        content = f.read()

    # Dashboard specifically:
    if "Dashboard.tsx" in file:
        content = re.sub(r'\{container\.name\}</div>', r'{(typeof container.name === "string" && container.name.length > 20) ? container.name.substring(0, 20) + "…" : container.name}</div>', content)
        content = re.sub(r'\{container\.image\}</div>', r'{(typeof container.image === "string" && container.image.length > 20) ? container.image.substring(0, 20) + "…" : container.image}</div>', content)
        content = re.sub(r'<div className="font-mono font-medium text-foreground">\{entry\.project\}</div>', r'<div className="font-mono font-medium text-foreground" title={entry.project}>{(typeof entry.project === "string" && entry.project.length > 20) ? entry.project.substring(0, 20) + "…" : entry.project}</div>', content)
        # Also need to handle removing prefix in children of a group:
        # Currently: {container.name} -> wait, my substitution above hits ALL container.name in Dashboard.
        # But we want to strip entry.project from child name if it exists.
        
    elif "Images.tsx" in file:
        content = re.sub(r'\{image\.name\}</div>', r'{(typeof image.name === "string" && image.name.length > 20) ? image.name.substring(0, 20) + "…" : image.name}</div>', content)
        content = re.sub(r'\{image\.tag\}</span>', r'{(typeof image.tag === "string" && image.tag.length > 20) ? image.tag.substring(0, 20) + "…" : image.tag}</span>', content)

    elif "Volumes.tsx" in file:
        content = re.sub(r'\{volume\.name\}</div>', r'{(typeof volume.name === "string" && volume.name.length > 20) ? volume.name.substring(0, 20) + "…" : volume.name}</div>', content)

    elif "Networks.tsx" in file:
        content = re.sub(r'\{network\.name\}</div>', r'{(typeof network.name === "string" && network.name.length > 20) ? network.name.substring(0, 20) + "…" : network.name}</div>', content)

    with open(file, "w") as f:
        f.write(content)

