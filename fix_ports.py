import os

def rewrite_file(filepath, callback):
    with open(filepath, 'r') as f:
        content = f.read()
    new_content = callback(content)
    with open(filepath, 'w') as f:
        f.write(new_content)

def add_portlinks(content):
    if "function PortLinks" not in content:
        port_links_code = """
function PortLinks({ ports }: { ports: string | null | undefined }) {
  if (!ports || ports === "—") return <span>—</span>;
  const parts = ports.split(", ");
  return (
    <div className="flex flex-col gap-0.5">
      {parts.map((part, idx) => {
        if (part.includes("->")) {
          const hostPart = part.split("->")[0];
          const portMatch = hostPart.match(/:(\\d+)$/);
          const port = portMatch ? portMatch[1] : null;
          if (port) {
            return (
              <a key={idx} href={`http://localhost:${port}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline hover:text-blue-400">
                {part}
              </a>
            );
          }
        }
        return <span key={idx}>{part}</span>;
      })}
    </div>
  );
}
"""
        # insert before "export function"
        content = content.replace("export default function", port_links_code + "\nexport default function")
    
    content = content.replace('{container.ports || "—"}', '<PortLinks ports={container.ports} />')
    return content

rewrite_file("src/pages/Containers.tsx", add_portlinks)
rewrite_file("src/pages/Dashboard.tsx", add_portlinks)
print("done")
