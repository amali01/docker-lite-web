import glob

# For Volumes, Images, Networks:
pages = ["src/pages/Volumes.tsx", "src/pages/Images.tsx", "src/pages/Networks.tsx"]
for p in pages:
    with open(p, "r") as f:
        content = f.read()

    # The existing block:
    # <button onClick={() => void handleBulkAction("remove")} className="inline-flex h-9 items-center rounded-md bg-destructive px-3 font-mono text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected">Delete</button>
    # <button onClick={() => selection.toggleAll(false)} className="inline-flex h-9 items-center rounded-md border border-border px-3 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted" title="Clear selection"><Trash2 className="h-4 w-4" /></button>
    
    import re
    # We want to replace the whole sequence of those two buttons
    new_content = re.sub(
        r'<button[^>]*onClick={\(\) => void handleBulkAction\("remove"\)}[^>]*>Delete</button>\s*<button[^>]*onClick={\(\) => selection\.toggleAll\(false\)}[^>]*><Trash2[^>]*></button>',
        r'<button type="button" onClick={() => void handleBulkAction("remove")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected"><Trash2 className="h-4 w-4" /></button>',
        content
    )
    
    with open(p, "w") as f:
        f.write(new_content)

print("Simple pages updated.")
