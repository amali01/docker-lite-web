with open("src/components/MonitoringOptions.tsx", "r") as f:
    text = f.read()

# We need to add `isLast?: boolean` to the props
text = text.replace(
    'isGroupItem = false }: { container: ContainerSummary; isGroupItem?: boolean }',
    'isGroupItem = false, isLast = false }: { container: ContainerSummary; isGroupItem?: boolean; isLast?: boolean }'
)

# And inject the absolute line if it's a group item and not last.
# <td colSpan={9} className="py-2.5 px-4 relative">
# {isGroupItem && !isLast && <div className="absolute left-[60px] top-0 bottom-0 w-px bg-primary/50 z-0" />}

text = text.replace(
    '<td colSpan={9} className="py-2.5 px-4">',
    '<td colSpan={10} className="py-2.5 px-4 relative">\n        {isGroupItem && !isLast && (\n          <div className="absolute left-[64px] top-0 bottom-0 w-px bg-primary/50 z-0" />\n        )}'
)

with open("src/components/MonitoringOptions.tsx", "w") as f:
    f.write(text)

