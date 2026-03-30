import re

with open("src/pages/Dashboard.tsx", "r") as f:
    orig_content = f.read()

content = orig_content.replace(
    '''<td className="p-3 pl-8">
                            <div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={container.name}>{(typeof container.name === "string" && container.name.length > 20) ? container.name.substring(0, 20) + "…" : container.name}</div>
                          </td>''',
    '''<td className="p-3 pl-8">
                            <div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={container.name}>{(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}</div>
                          </td>'''
)

with open("src/pages/Dashboard.tsx", "w") as f:
    f.write(content)

if orig_content == content:
    print("NO MATCH")
else:
    print("MATCHED AND REPLACED")
