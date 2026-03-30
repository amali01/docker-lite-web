import re
with open('src/pages/Containers.tsx', 'r') as f:
    text = f.read()
text = re.sub(r'<div className="flex items-center justify-end gap-1">\s*<button onClick=\{\(\) => toggleMonitoring\(container\.id\)\}[^>]*>\s*<Activity[^>]*>\s*</button>\s*<div className="flex items-center justify-end gap-1">', r'<div className="flex items-center justify-end gap-1">', text, flags=re.DOTALL)
text = text.replace('/>\n                            </div>\n                            </div>', '/>\n                            </div>')

with open('src/pages/Containers.tsx', 'w') as f: f.write(text)
