import re

for fpath in ["src/pages/Images.tsx", "src/pages/Networks.tsx", "src/pages/Volumes.tsx", "src/pages/Dashboard.tsx"]:
    with open(fpath, "r") as f:
        content = f.read()
    
    # We only want to replace bg-muted/20 with bg-muted IN sticky right-0 lines.
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if "sticky right-0" in line:
            line = line.replace("bg-muted/20", "bg-muted")
            line = line.replace("group-hover:bg-muted/30", "group-hover:bg-muted")
            # For z-20 in td, replace with z-10 for td specifically (not th)
            if "<td" in line:
                line = line.replace("z-20", "z-10")
            lines[i] = line
            
    content = '\n'.join(lines)
    
    with open(fpath, "w") as f:
        f.write(content)
print("Stickies fixed")
