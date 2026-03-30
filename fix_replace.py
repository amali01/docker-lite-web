import sys

with open("src/pages/Containers.tsx", "r") as f:
    content = f.read()

content = content.replace("container.memUsage ? container.memUsage.replace(/.*\\\\//, \\\"\\\").trim() : \\\"—\\\"", 
                          "container.memUsage ? container.memUsage.replace(/\\\\s*\\\\/.*/, \\\"\\\").trim() : \\\"—\\\"")

with open("src/pages/Containers.tsx", "w") as f:
    f.write(content)
print("done")
