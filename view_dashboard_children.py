import re
with open("src/pages/Dashboard.tsx") as f:
    text = f.read()

m = re.search(r'expandedGroups\[entry\.project\]\s*&&\s*entry\.containers\.map.*?</tr', text, re.DOTALL)
if m:
    start = m.start()
    print(text[start:start+1000])

