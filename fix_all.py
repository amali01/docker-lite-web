import re

def fix_tree_lines(file):
    with open(file, "r") as f:
        content = f.read()

    # Change to bg-primary/40 or bg-primary/60? Pic 2 shows same blue, maybe slightly dimmed. Let's use bg-primary/60.
    # Actually wait. The chevron color is text-primary. Let me make it bg-primary/50 for a safe middle ground... 
    # Actually I'll strictly use bg-primary/60 as requested since they said "same blue color"
    content = content.replace("bg-border/70 z-0", "bg-primary/40 z-0") 
    # Also fix width of horizontal line: it was `w-4 h-px` -> `w-[20px] h-px`
    content = content.replace("w-4 h-px bg-primary/40 z-0", "w-[20px] h-px bg-primary/40 z-0")
    
    with open(file, "w") as f:
        f.write(content)

fix_tree_lines("src/pages/Containers.tsx")
fix_tree_lines("src/pages/Dashboard.tsx")

