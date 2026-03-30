import re

def process_file(file_path):
    with open(file_path, "r") as f:
        content = f.read()

    # The row class is usually: className="group border-b border-border/50 hover:bg-muted/30 transition-colors"
    # or className="group border-b border-border/50 hover:bg-muted/30 transition-colors bg-card"
    
    # We want to add an onClick handler to the child and un-grouped `tr`s, which maps to `container`.
    # It might be safer to replace `className="group border-b border-border/50 hover:bg-muted/30 transition-colors"`
    # with `onClick={(e) => { if (!(e.target as HTMLElement).closest('button, a, input, [role="checkbox"]')) toggleMonitoring(container.id); }} className="cursor-pointer group border-b border-border/50 hover:bg-muted/30 transition-colors"`

    # Let's inspect
    print("Matches in", file_path, ":")
    matches = re.finditer(r'<tr[^>]*className="group border-b border-border/50 hover:bg-muted/30 transition-colors[^"]*"[^>]*>', content)
    for m in matches:
        print(m.group(0))

process_file("src/pages/Containers.tsx")
process_file("src/pages/Dashboard.tsx")

