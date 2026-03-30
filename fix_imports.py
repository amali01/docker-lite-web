import re

for page in ["src/pages/Containers.tsx", "src/pages/Dashboard.tsx"]:
    with open(page, "r") as f:
        p = f.read()
    
    p = p.replace('useRestartContainer,', 'useRestartContainer,\n  useRebuildContainer,')
    
    with open(page, "w") as f:
        f.write(p)

