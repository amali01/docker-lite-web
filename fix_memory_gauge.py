import re

with open("src/pages/Containers.tsx", "r") as f:
    content = f.read()

# 1. Update the table headers: replace Mem and Mem % with Memory
content = re.sub(
    r'<th className="text-left p-3">Mem</th>\s*<th className="text-left p-3">Mem %</th>',
    r'<th className="text-center p-3">Memory</th>',
    content
)

# 2. Update colSpan from 10 to 9 in MonitoringRow
content = re.sub(r'colSpan=\{10\}', 'colSpan={9}', content)

# 3. Create the MemoryGauge UI
def get_gauge(container_prefix="container."):
    return f"""<td className="p-3 text-center align-middle">
          <div className="flex flex-col items-center justify-center" title={{{container_prefix}memUsage || "N/A"}}>
            <div className="relative w-10 h-5 flex items-end justify-center mb-1">
              <svg viewBox="0 0 100 50" className="absolute top-0 left-0 w-full h-full overflow-visible">
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" className="stroke-muted/30" strokeWidth="12" strokeLinecap="round" />
                <path 
                  d="M 10 50 A 40 40 0 0 1 90 50" 
                  fill="none" 
                  className={{`transition-all duration-500 ease-in-out ${{({container_prefix}memPercent || 0) > 80 ? 'stroke-destructive' : 'stroke-primary'}}`}} 
                  strokeWidth="12" 
                  strokeLinecap="round" 
                  strokeDasharray="125.6" 
                  strokeDashoffset={{125.6 - (({container_prefix}memPercent || 0) / 100) * 125.6}} 
                />
              </svg>
              <span className="text-[10px] font-mono leading-none z-10 font-bold translate-y-[2px]">
                {{{container_prefix}memPercent ? {container_prefix}memPercent.toFixed(0) : "0"}}%
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono leading-none">
              {{{container_prefix}memUsage ? {container_prefix}memUsage.replace(/.*\\//, "").trim() : "—"}}
            </span>
          </div>
        </td>"""

# We need to replace the two `<td>` lines for memory in both places (group containers and direct containers)
# The pattern to find:
# <td className="p-3 font-mono text-muted-foreground">{container.memUsage ?? "—"}</td>
# <td className="p-3 font-mono text-muted-foreground">{container.memPercent ? `${container.memPercent.toFixed(1)}%` : "—"}</td>

mem_pattern = r'<td className="p-3 font-mono text-muted-foreground">\{container\.memUsage \?\? "—"\}</td>\s*<td className="p-3 font-mono text-muted-foreground">\{container\.memPercent \? `\$\{container\.memPercent\.toFixed\(1\)\}%` : "—"\}</td>'

content = re.sub(mem_pattern, get_gauge(), content)

with open("src/pages/Containers.tsx", "w") as f:
    f.write(content)
print("Updated Containers.tsx")
