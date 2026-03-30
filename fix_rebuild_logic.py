import re

for page in ["src/pages/Containers.tsx", "src/pages/Dashboard.tsx"]:
    with open(page, "r") as f:
        p = f.read()
    
    # Check if we already did it
    if 'action === "rebuild"' in p:
        continue

    # Find the restart block and append rebuild.
    # restart block:
    #      if (action === "restart") { await restartMutation.mutateAsync(container.id); toast.success(`Restarted ${container.name}`); return; }
    # OR multi-line variant.
    
    m = re.search(r'(if\s*\(action\s*===\s*"restart"\)\s*\{[^\}]+\})', p, re.DOTALL)
    if m:
        repl = m.group(1) + '\n      if (action === "rebuild") { await rebuildMutation.mutateAsync(container.id); toast.success(`Rebuilding ${container.name}...`); return; }'
        # Be careful not to replace bulk actions loop in Containers.tsx where it doesn't have `return;`
        # Actually I can just replace the first occurrence or use a stricter pattern matching `return;`
        
    p = re.sub(r'(if\s*\(action\s*===\s*"restart"\)\s*\{\s*await restartMutation\.mutateAsync\(container\.id\);\s*toast\.success\(`Restarted \$\{container\.name\}`\);\s*return;\s*\})',
               r'\1\n      if (action === "rebuild") {\n        toast.info(`Rebuilding ${container.name}...`);\n        await rebuildMutation.mutateAsync(container.id);\n        toast.success(`Rebuilt ${container.name}`);\n        return;\n      }',
               p)
    
    with open(page, "w") as f:
        f.write(p)

