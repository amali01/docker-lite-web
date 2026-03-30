files = [
    "server/src/engine-controller.ts",
    "server/src/index.ts",
    "server/src/types.ts",
    "server/src/docker/client.ts"
]

for f in files:
    with open(f, "r") as file:
        text = file.read()
    if "\\n" in text:
        text = text.replace("\\n", "\n")
        with open(f, "w") as file:
            file.write(text)
print("done")
