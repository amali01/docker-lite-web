with open("src/pages/Dashboard.tsx", "r") as f:
    content = f.read()

# Fix header
content = content.replace('<th className="text-left p-3">Memory</th>', '<th className="text-center p-3">Memory</th>')

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
              {{{container_prefix}memUsage ? {container_prefix}memUsage.replace(/\s*\\/.*/, "").trim() : "—"}}
            </span>
          </div>
        </td>"""

# Replace
content = content.replace('<td className="p-3 font-mono text-muted-foreground">{formatMetric(container.memUsage)}</td>', get_gauge())

with open("src/pages/Dashboard.tsx", "w") as f:
    f.write(content)
print("Dashboard memory gauge fixed with replace")
