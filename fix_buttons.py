with open("src/components/ContainerActionButtons.tsx", "r") as f:
    text = f.read()

text = text.replace("logsActive?: boolean;", "logsActive?: boolean;\\n  terminalActive?: boolean;")
text = text.replace("logsActive, onAction", "logsActive, terminalActive, onAction")
text = text.replace(
    'className={cn(buttonClassName, "hover:bg-muted text-muted-foreground")} title="Terminal"',
    'className={cn(buttonClassName, "hover:bg-muted", terminalActive ? "text-primary bg-primary/10" : "text-muted-foreground")} title="Terminal"'
)

with open("src/components/ContainerActionButtons.tsx", "w") as f:
    f.write(text)
print("done")
