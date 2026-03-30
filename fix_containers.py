import re
with open('src/pages/Containers.tsx', 'r') as f: content = f.read()

# I need to find the first occurrence of the replacement and change it to the entry.project stripping version.
old_str = r'\{(typeof container\.name === "string" && container\.name\.length > 20\) \? container\.name\.substring\(0, 20\) \+ "…" : container\.name\}'
new_str = r'{(() => { const n = (entry.project && container.name.startsWith(entry.project + "-")) ? container.name.replace(entry.project + "-", "") : container.name; return (typeof n === "string" && n.length > 20) ? n.substring(0, 20) + "…" : n; })()}'

content = re.sub(old_str, new_str, content, count=1)

with open('src/pages/Containers.tsx', 'w') as f: f.write(content)
