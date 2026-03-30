import re
with open("src/pages/Dashboard.tsx") as f:
    t = f.read()
m = re.search(r'entry\.containers\.map.*?<td className="p-3 pl-8">.*?</td', t, re.DOTALL)
if m:
    print(m.group(0))
