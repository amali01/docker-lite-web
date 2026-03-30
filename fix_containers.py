import re

p = "src/pages/Containers.tsx"
with open(p, "r") as f:
    content = f.read()

# Replace the text "Delete" for remove action with an icon button, and drop the Trash2 clear selection button.
# Note: Containers.tsx has Start, Stop, Restart buttons in between.
# Existing:
"""
            <button
              type="button"
              onClick={() => void handleBulkAction("remove")}
              className="inline-flex h-9 items-center rounded-md bg-destructive px-3 font-mono text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
              title="Delete selected containers"
            >
              Delete
            </button>
            <button
...
            <button
              type="button"
              onClick={() => selection.toggleAll(false)}
              className="inline-flex h-9 items-center rounded-md border border-border px-3 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted"
              title="Clear selection"
            >
              <Trash2 className="h-4 w-4" />
            </button>
"""

new_content = re.sub(
    r'<button[^>]*onClick={\(\) => void handleBulkAction\("remove"\)}[^>]*>\s*Delete\s*</button>',
    r'<button type="button" onClick={() => void handleBulkAction("remove")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected containers"><Trash2 className="h-4 w-4" /></button>',
    content
)

new_content = re.sub(
    r'<button[^>]*onClick={\(\) => selection\.toggleAll\(false\)}[^>]*>\s*<Trash2 className="h-4 w-4" />\s*</button>',
    '',
    new_content
)

with open(p, "w") as f:
    f.write(new_content)

print("Containers updated")
