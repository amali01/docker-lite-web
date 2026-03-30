import re

path = "src/pages/Volumes.tsx"
with open(path, "r") as f:
    text = f.read()

# 1. Update tr for group to have onClick instead of wrapping button logic. Or just add the wrap.
# Find `<tr className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">` in Fragment loop
# Also replace button:
# From: `<button onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left">`
# To: `<button type="button" onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left relative z-10">`

text = text.replace(
    '<tr className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">',
    '<tr onClick={(e) => { if (!(e.target as HTMLElement).closest(\'button, a, input, [role="checkbox"], .cursor-default\')) toggleGroup(entry.project); }} className="cursor-pointer group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">'
)

# Replace <td className="p-3"> where button is:
text = text.replace(
    '''                      <td className="p-3">
                        <button onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left">''',
    '''                      <td className="p-3 relative">
                        {expandedGroups[entry.project] && (
                          <div className="absolute left-[20px] top-1/2 -bottom-[1px] w-px bg-primary/50 z-0" />
                        )}
                        <button type="button" onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left relative z-10">'''
)

# 2. Update `<td className="p-3 font-mono text-foreground flex items-center gap-2 pl-8"><HardDrive className="w-3.5 h-3.5 text-primary" /> {volume.name}</td>` 
# Which is inside map `entry.volumes.map((volume) => (`
# Also we need an index out of `entry.volumes.map((volume) => (`
text = text.replace(
    'entry.volumes.map((volume) => (',
    'entry.volumes.map((volume, index, arr) => ('
)

# Let's replace the single td with the relative td + tree lines:
td_vol_old = '<td className="p-3 font-mono text-foreground flex items-center gap-2 pl-8"><HardDrive className="w-3.5 h-3.5 text-primary" /> {volume.name}</td>'
td_vol_new = '''<td className="p-3 relative">
                          <div className="absolute left-[20px] top-0 bottom-1/2 w-px bg-primary/50 z-0" />
                          {index !== arr.length - 1 && (
                            <div className="absolute left-[20px] top-1/2 -bottom-[1px] w-px bg-primary/50 z-0" />
                          )}
                          <div className="absolute left-[20px] top-1/2 w-[20px] h-px bg-primary/50 z-0" />
                          <div className="flex items-center gap-2 pl-6 relative z-10">
                            <div className="h-2 w-2 rounded-full border border-primary/60 bg-background shrink-0" />
                            <div className="font-mono font-medium text-foreground max-w-[8rem] truncate md:max-w-[11rem] lg:max-w-[14rem] xl:max-w-[18rem]" title={volume.name}>{volume.name}</div>
                          </div>
                        </td>'''
text = text.replace(td_vol_old, td_vol_new)

with open(path, "w") as f:
    f.write(text)

