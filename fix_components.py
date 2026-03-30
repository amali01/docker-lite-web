def safe_replace(filepath, search, replace):
    with open(filepath, "r") as f:
        text = f.read()
    if search in text:
        text = text.replace(search, replace)
        with open(filepath, "w") as f:
            f.write(text)

render_block = """
          {logsContainer && (
            <div className="absolute right-0 top-0 bottom-0 w-[600px] border-l shadow-2xl bg-card z-20 flex flex-col max-w-[90vw]">
              <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                <h3 className="font-semibold text-sm truncate pr-4">Logs: {logsContainer.name.replace(/^\\//, "")}</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setLogsContainer(null)}>
                  <span className="sr-only">Close logs</span>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ContainerLogs containerId={logsContainer.id} />
              </div>
            </div>
          )}
          {terminalContainer && (
            <div className="absolute right-0 top-0 bottom-0 w-[600px] border-l shadow-2xl bg-card z-20 flex flex-col max-w-[90vw]">
              <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                <h3 className="font-semibold text-sm truncate pr-4">Terminal: {terminalContainer.name.replace(/^\\//, "")}</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setTerminalContainer(null)}>
                  <span className="sr-only">Close terminal</span>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                </Button>
              </div>
              <div className="flex-1 overflow-hidden bg-black p-2">
                <ContainerExec containerId={terminalContainer.id} />
              </div>
            </div>
          )}
"""

old_block = """
          {logsContainer && (
            <div className="absolute right-0 top-0 bottom-0 w-[600px] border-l shadow-2xl bg-card z-20 flex flex-col max-w-[90vw]">
              <div className="flex items-center justify-between p-3 border-b bg-muted/30">
                <h3 className="font-semibold text-sm truncate pr-4">Logs: {logsContainer.name.replace(/^\//, "")}</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setLogsContainer(null)}>
                  <span className="sr-only">Close logs</span>
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"><path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path></svg>
                </Button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ContainerLogs containerId={logsContainer.id} />
              </div>
            </div>
          )}
"""

safe_replace("src/pages/Containers.tsx", old_block.strip(), render_block.strip())
safe_replace("src/pages/Dashboard.tsx", old_block.strip(), render_block.strip())

# also update the setLogsContainer action in Dashboard
dash_action = """
      if (action === "logs") {
        setLogsContainer((current) => (current?.id === container.id ? null : container));
        return;
      }

      toast.info("Container exec terminal is not implemented yet.");
"""
new_dash_action = """
      if (action === "logs") {
        setTerminalContainer(null);
        setLogsContainer((current) => (current?.id === container.id ? null : container));
        return;
      }
      if (action === "terminal") {
        setLogsContainer(null);
        setTerminalContainer((current) => (current?.id === container.id ? null : container));
        return;
      }
"""

safe_replace("src/pages/Dashboard.tsx", dash_action.strip(), new_dash_action.strip())

