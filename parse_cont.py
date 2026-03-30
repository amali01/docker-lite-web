import re
with open("src/pages/Containers.tsx") as f:
    t = f.read()

m = re.search(r'flex items-start gap-2 pl-6.*?</td>', t, re.DOTALL)
if m:
    print(m.group(0))

