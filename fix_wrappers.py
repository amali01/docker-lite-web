import re

for fpath in ["src/pages/Images.tsx", "src/pages/Networks.tsx", "src/pages/Volumes.tsx"]:
    with open(fpath, "r") as f:
        content = f.read()

    # Find the wrapper div
    if "overflow-hidden overflow-x-auto" in content:
        content = re.sub(
            r'<div className="bg-card border border-border rounded-md overflow-hidden overflow-x-auto">\s*<table',
            r'<div className="bg-card border border-border rounded-md overflow-hidden">\n        <div className="overflow-x-auto">\n          <table',
            content
        )
        content = re.sub(
            r'</table>\s*</div>\n\s*(?:</main>|{)',
            r'</table>\n        </div>\n      </div>\n      \g<0>', # This is tricky since we match `</div>` we need to insert another one.
            content
        )

        
# Let's write a safer wrapper replacement using line-by-line or a more precise regex.

def fix_file(fpath):
    with open(fpath, "r") as f:
        content = f.read()
        
    s1 = '<div className="bg-card border border-border rounded-md overflow-hidden overflow-x-auto">'
    r1 = '<div className="bg-card border border-border rounded-md overflow-hidden">\n        <div className="overflow-x-auto">'
    if s1 in content:
        content = content.replace(s1, r1)
        # now we need to find the `</table>` and insert a `</div>` directly after it.
        content = re.sub(r'(</table>\s*</div>)', r'</table>\n        </div>\n      </div>', content, count=1)
        # Actually `</table>` is followed by `</div>` which closes the `bg-card` div.
        # Wait, instead of replacing `</table>\n</div>`, let's just replace `</table>\n      </div>` with `</table>\n        </div>\n      </div>`.
        
    with open(fpath, "w") as f:
        f.write(content)

for p in ["src/pages/Images.tsx", "src/pages/Networks.tsx", "src/pages/Volumes.tsx"]:
    fix_file(p)
print("Wrappers fixed")
