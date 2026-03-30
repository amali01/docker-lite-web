import re

with open("src/pages/Dashboard.tsx", "r") as f:
    content = f.read()

# Instead of the plain 20 char trunc, we want the conditional prefix strip like Containers.tsx for the child rendering.
child_find = r'<div className="font-mono font-medium text-foreground max-w-\[8rem\] truncate md:max-w-\[11rem\] lg:max-w-\[14rem\] xl:max-w-\[18rem\]" title=\{container\.name\}>\{\(typeof container\.name === "string" && container\.name\.length > 20\) \? container\.name\.substring\(0, 20\) \+ "…" : container\.name\}</div>'
child_repl = r'<div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={container.name}>{(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}</div>'

content = content.replace(child_find, child_repl, 1)

with open("src/pages/Dashboard.tsx", "w") as f:
    f.write(content)

