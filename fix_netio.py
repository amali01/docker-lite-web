import re

with open("src/pages/Containers.tsx", "r") as f:
    content = f.read()

# Header:
content = content.replace('<th className="text-left p-3">NetIO</th>', '<th className="text-left p-3">Network I/O</th>')

# Body cells:
# We have `<td className="p-3 font-mono text-muted-foreground">{container.netIO ?? "—"}</td>` twice (group and child/loose)

# We want: 
# <td className="p-3 font-mono text-muted-foreground">
#   {container.netIO && container.netIO.includes("/") ? (
#     <div className="flex flex-col text-[10px] leading-tight">
#       <span className="text-emerald-500" title="Upload">&#8593; {container.netIO.split("/")[1].trim()}</span>
#       <span className="text-blue-500" title="Download">&#8595; {container.netIO.split("/")[0].trim()}</span>
#     </div>
#   ) : (container.netIO ?? "—")}
# </td>
# Note: Docker `Net I/O` usually reports rx/tx (receive=download / transmit=upload). 
# rx / tx -> index 0 is download, index 1 is upload.

rx_tx_replacement = r'''<td className="p-3">
  {container.netIO && container.netIO.includes("/") ? (
    <div className="flex flex-col text-[10px] font-mono leading-tight">
      <span className="text-emerald-500" title="Upload">↑ {container.netIO.split("/")[1].trim()}</span>
      <span className="text-blue-500" title="Download">↓ {container.netIO.split("/")[0].trim()}</span>
    </div>
  ) : (
    <div className="font-mono text-muted-foreground text-sm">{container.netIO ?? "—"}</div>
  )}
</td>'''

content = content.replace('<td className="p-3 font-mono text-muted-foreground">{container.netIO ?? "—"}</td>', rx_tx_replacement)

with open("src/pages/Containers.tsx", "w") as f:
    f.write(content)

