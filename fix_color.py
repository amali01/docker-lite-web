def fix_c(file):
    with open(file, "r") as f:
        c = f.read()
    c = c.replace("bg-primary/40 z-0", "bg-primary/50 z-0")
    with open(file, "w") as f:
        f.write(c)

fix_c("src/pages/Containers.tsx")
fix_c("src/pages/Dashboard.tsx")
