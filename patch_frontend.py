import os
import re

# 1. Update ContainerActionButtons
with open("src/components/ContainerActionButtons.tsx", "r") as f:
    text = f.read()

text = text.replace('import { FileText, Play, RotateCcw, Square, Terminal, Trash2 } from "lucide-react";', 
                    'import { FileText, Play, RotateCcw, Square, Terminal, Trash2, ArrowUpCircle } from "lucide-react";')
text = text.replace('"start" | "stop" | "restart" | "remove" | "logs" | "terminal",',
                    '"start" | "stop" | "restart" | "remove" | "logs" | "terminal" | "rebuild",')

rebuild_btn = '''      <button onClick={() => onAction("rebuild", container)} className={cn(buttonClassName, "hover:bg-primary/10 text-primary")} title="Update & Rebuild">
        <ArrowUpCircle className={iconClassName} />
      </button>
      <button onClick={() => onAction("restart", container)}'''

text = text.replace('<button onClick={() => onAction("restart", container)}', rebuild_btn)

with open("src/components/ContainerActionButtons.tsx", "w") as f:
    f.write(text)


# 2. Update hooks
with open("src/hooks/use-containers.ts", "r") as f:
    hooks = f.read()

hooks = hooks.replace('restartContainer,', 'restartContainer,\n  rebuildContainer,')
hooks += '\nexport const useRebuildContainer = createContainerMutation(rebuildContainer);\n'

with open("src/hooks/use-containers.ts", "w") as f:
    f.write(hooks)


# 3. Update resources
with open("src/lib/api/resources.ts", "r") as f:
    res = f.read()

res += '''
export function rebuildContainer(id: string) {
  return apiRequest<ContainerSummary>(`/api/containers/${id}/rebuild`, {
    method: "POST",
  });
}
'''
with open("src/lib/api/resources.ts", "w") as f:
    f.write(res)


# 4. Update Pages
for page in ["src/pages/Containers.tsx", "src/pages/Dashboard.tsx"]:
    with open(page, "r") as f:
        p = f.read()
    
    # Add mutation
    p = p.replace('const restartMutation = useRestartContainer();', 'const restartMutation = useRestartContainer();\n  const rebuildMutation = useRebuildContainer();')
    
    # Add to handleAction
    action_signature = 'action: "start" | "stop" | "restart" | "remove" | "logs" | "terminal"'
    p = p.replace(action_signature, action_signature + ' | "rebuild"')
    
    rebuild_logic = 'if (action === "restart") { await restartMutation.mutateAsync(container.id); toast.success(`Restarted ${container.name}`); return; }'
    rebuild_logic_repl = rebuild_logic + '\n      if (action === "rebuild") { await rebuildMutation.mutateAsync(container.id); toast.success(`Rebuilding ${container.name}...`); return; }'
    
    p = p.replace(rebuild_logic, rebuild_logic_repl)
    
    with open(page, "w") as f:
        f.write(p)

