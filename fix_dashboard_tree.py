import re

with open("src/pages/Dashboard.tsx", "r") as f:
    content = f.read()

# Fix Parent Row
parent_find = '''<td className="p-3">
                          <button type="button" onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left">'''
parent_repl = '''<td className="p-3 relative">
                          {expandedGroups[entry.project] && (
                            <div className="absolute left-[20px] top-[31px] bottom-0 w-px bg-border/70 z-0" />
                          )}
                          <button type="button" onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left relative z-10">'''

# Fix Child Loop Signature
child_loop_find = '''entry.containers.map((container) => ('''
child_loop_repl = '''entry.containers.map((container, index, arr) => ('''

# Fix Child Row
child_row_find = '''<td className="p-3 pl-8">
                            <div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={container.name}>{(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}</div>
                          </td>'''
child_row_repl = '''<td className="p-3 relative">
                            <div className="absolute left-[20px] top-0 bottom-1/2 w-px bg-border/70 z-0" />
                            {index !== arr.length - 1 && (
                              <div className="absolute left-[20px] top-1/2 bottom-0 w-px bg-border/70 z-0" />
                            )}
                            <div className="absolute left-[20px] top-1/2 w-4 h-px bg-border/70 z-0" />
                            <div className="flex items-center gap-2 pl-6 relative z-10">
                              <div className="h-2 w-2 rounded-full border border-primary/60 bg-background shrink-0" />
                              <div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={container.name}>{(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}</div>
                            </div>
                          </td>'''

content = content.replace(parent_find, parent_repl)
content = content.replace(child_loop_find, child_loop_repl)
content = content.replace(child_row_find, child_row_repl)

with open("src/pages/Dashboard.tsx", "w") as f:
    f.write(content)

