import re

def rewrite_page(filepath):
    with open(filepath, "r") as f:
        content = f.read()

    # Imports
    if "ContainerExec" not in content:
        content = content.replace('import { ContainerLogs } from "@/components/ContainerLogs";', 
                                  'import { ContainerLogs } from "@/components/ContainerLogs";\\nimport { ContainerExec } from "@/components/ContainerExec";')
    
    # States
    if "const [terminalContainer," not in content:
        content = content.replace("const [logsContainer, setLogsContainer] =",
                                  "const [terminalContainer, setTerminalContainer] = useState<ContainerSummary | null>(null);\\n  const [logsContainer, setLogsContainer] =")

        # In handleAction
        search_action = """      if (action === "logs") {
        setLogsContainer((current) => (current?.id === container.id ? null : container));
        return;
      }

      toast.info("Container exec terminal is not implemented yet.");"""
        
        replace_action = """      if (action === "logs") {
        setTerminalContainer(null);
        setLogsContainer((current) => (current?.id === container.id ? null : container));
        return;
      }
      
      if (action === "terminal") {
        setLogsContainer(null);
        setTerminalContainer((current) => (current?.id === container.id ? null : container));
        return;
      }"""
        content = content.replace(search_action, replace_action)
        
        # UI Action Button calls
        content = content.replace("logsActive={logsContainer?.id === container.id}",
                                  "logsActive={logsContainer?.id === container.id} terminalActive={terminalContainer?.id === container.id}")
        
        # Split pane render
        search_pane = """        {(logsContainer) && (
          <div className="w-full lg:w-1/3 lg:border-l border-t lg:border-t-0 border-border flex flex-col">
            {logsContainer && (
              <ContainerLogs
                containerId={logsContainer.id}
                containerName={logsContainer.name}
                onClose={() => setLogsContainer(null)}
              />
            )}
          </div>
        )}"""
        
        replace_pane = """        {(logsContainer || terminalContainer) && (
          <div className="w-full lg:w-1/3 lg:border-l border-t lg:border-t-0 border-border flex flex-col">
            {logsContainer && (
              <ContainerLogs
                containerId={logsContainer.id}
                containerName={logsContainer.name}
                onClose={() => setLogsContainer(null)}
              />
            )}
            {terminalContainer && (
              <ContainerExec
                containerId={terminalContainer.id}
                containerName={terminalContainer.name}
                onClose={() => setTerminalContainer(null)}
              />
            )}
          </div>
        )}"""
        content = content.replace(search_pane, replace_pane)
        
        # Also fix missing split panes width logic (Dashboard and Containers might have slightly different markup so I'll do regex if needed)
        # Dashboard:  <div className={cn("flex flex-col lg:flex-row h-full min-h-[calc(100vh-3.5rem)]", logsContainer ? "lg:flex-row" : "")}>
        # Containers: <div className={cn("flex flex-col lg:flex-row h-full min-h-[calc(100vh-3.5rem)]", logsContainer ? "lg:flex-row" : "")}>
        content = content.replace('logsContainer ? "lg:flex-row" : ""', '(logsContainer || terminalContainer) ? "lg:flex-row" : ""')
        
    with open(filepath, "w") as f:
        f.write(content)
    print(f"Patched {filepath}")

rewrite_page("src/pages/Containers.tsx")
rewrite_page("src/pages/Dashboard.tsx")
