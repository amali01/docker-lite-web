import re

with open("src/pages/Containers.tsx", "r") as f:
    text = f.read()

# Current logic starts with `{container.netIO && container.netIO.includes("/")`
# We want to replace the whole expression with a parser that handles the comma separated format properly.

# Let's find the current block
m = re.search(r'\{container\.netIO && container\.netIO\.includes\("/"\).+?</td', text, re.DOTALL)
if m:
    # Build replacement
    repl = '''{container.netIO && (container.netIO.includes(",") || container.netIO.includes("/")) ? (
    <div className="flex flex-col text-[12px] font-mono leading-[1.3] text-muted-foreground w-max">
      <div className="text-blue-400 flex items-center gap-1" title="Download">
        <span className="w-3 text-center">↓</span>
        <span>{container.netIO.includes(",") ? container.netIO.split(",")[0].replace(/[↓,]/g, "").trim() : container.netIO.split("/")[0].trim()}</span>
      </div>
      <div className="text-emerald-400 flex items-center gap-1" title="Upload">
        <span className="w-3 text-center">↑</span>
        <span>{container.netIO.includes(",") ? container.netIO.split(",")[1].replace(/[↑,]/g, "").trim() : container.netIO.split("/")[1].trim()}</span>
      </div>
    </div>
  ) : (
    <div className="font-mono text-muted-foreground text-sm">{container.netIO ?? "—"}</div>
  )}
</td'''
    new_text = text[:m.start()] + repl + text[m.end():]
    with open("src/pages/Containers.tsx", "w") as f:
        f.write(new_text)

