import re

def fix(path):
    with open(path, "r") as f:
        text = f.read()

    # 1. Group Header:
    # <div className="absolute left-[20px] top-[31px] bottom-0 w-px bg-primary/50 z-0" />
    # to <div className="absolute left-[20px] top-1/2 -bottom-[1px] w-px bg-primary/50 z-0" />
    text = text.replace(
        '<div className="absolute left-[20px] top-[31px] bottom-0 w-px bg-primary/50 z-0" />',
        '<div className="absolute left-[20px] top-1/2 -bottom-[1px] w-px bg-primary/50 z-0" />'
    )

    # 2. Child row lines:
    # In Containers.tsx: <div className="absolute left-[20px] top-[20px] bottom-0 w-px bg-primary/50 z-0" />
    text = text.replace(
        '<div className="absolute left-[20px] top-[20px] bottom-0 w-px bg-primary/50 z-0" />',
        '<div className="absolute left-[20px] top-[20px] -bottom-[1px] w-px bg-primary/50 z-0" />'
    )
    
    # In Dashboard.tsx: <div className="absolute left-[20px] top-1/2 bottom-0 w-px bg-primary/50 z-0" />
    text = text.replace(
        '<div className="absolute left-[20px] top-1/2 bottom-0 w-px bg-primary/50 z-0" />',
        '<div className="absolute left-[20px] top-1/2 -bottom-[1px] w-px bg-primary/50 z-0" />'
    )
    
    # Also top-0 connecting down to 1/2 in Dashboard might need to start at -1px? No, top-0 connects to the bottom of the previous row which had -bottom-[1px], so they overlap perfectly!
    # Let's also do top-0 to -top-[1px] just in case?
    # Actually, -bottom-[1px] makes the div 1px taller downwards. That's enough to overlap the gap.
    
    with open(path, "w") as f:
        f.write(text)

fix("src/pages/Containers.tsx")
fix("src/pages/Dashboard.tsx")

