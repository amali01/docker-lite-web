import re

p = "src/pages/Dashboard.tsx"
with open(p, "r") as f:
    content = f.read()

# Add aria-label back to container Checkboxes
content = content.replace(
    '<Checkbox checked={selection.selectedIds.includes(container.id)} onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)} />',
    '<Checkbox aria-label={`Select dashboard container ${container.name}`} checked={selection.selectedIds.includes(container.id)} onCheckedChange={(checked) => selection.toggleOne(container.id, checked === true)} />'
)

with open(p, "w") as f:
    f.write(content)

print("Dashboard aria label fixed")
