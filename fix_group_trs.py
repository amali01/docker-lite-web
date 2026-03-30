import re

def fix_containers():
    with open("src/pages/Containers.tsx", "r") as f:
        content = f.read()
    
    content = content.replace(
        '<tr key={`group-${entry.project}`} className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">',
        '<tr key={`group-${entry.project}`} onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleGroup(entry.project); }} className="cursor-pointer group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">'
    )
    with open("src/pages/Containers.tsx", "w") as f:
        f.write(content)

def fix_dashboard():
    with open("src/pages/Dashboard.tsx", "r") as f:
        content = f.read()

    content = content.replace(
        '<tr className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">',
        '<tr onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleGroup(entry.project); }} className="cursor-pointer group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">'
    )
    with open("src/pages/Dashboard.tsx", "w") as f:
        f.write(content)

fix_containers()
fix_dashboard()
