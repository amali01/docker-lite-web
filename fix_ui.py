import os
import re

files_to_check = [
    "src/pages/Dashboard.tsx",
    "src/pages/Images.tsx",
    "src/pages/Volumes.tsx",
    "src/pages/Networks.tsx",
    "src/pages/Containers.tsx"
]

for file in files_to_check:
    if not os.path.exists(file): continue
    with open(file, "r") as f:
        content = f.read()

    # 1. Remove opacity classes entirely
    content = content.replace(" opacity-0 group-hover:opacity-100 transition-opacity", "")
    content = content.replace(" opacity-0 group-hover:opacity-100", "")

    with open(file, "w") as f:
        f.write(content)

