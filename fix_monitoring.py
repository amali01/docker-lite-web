import re

with open("src/pages/Containers.tsx", "r") as f:
    content = f.read()

# Define the new component
COMPONENT = """
const MonitoringRow = ({ container, isGroupItem = false }: { container: ContainerSummary; isGroupItem?: boolean }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem(`docker-monitoring-${container.id}`);
      return stored ? JSON.parse(stored) : {
        enabled: false, autoRestart: false, monitorLogs: false, logPatterns: "error,panic,fatal,exception"
      };
    } catch {
      return { enabled: false, autoRestart: false, monitorLogs: false, logPatterns: "error,panic,fatal,exception" };
    }
  });

  const updateSetting = (key: string, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem(`docker-monitoring-${container.id}`, JSON.stringify(newSettings));
  };

  return (
    <tr className="bg-muted/10 border-b border-border/50 shadow-inner">
      <td colSpan={10} className="py-2.5 px-4">
        <div className={`flex flex-row items-center gap-5 text-sm ${isGroupItem ? "ml-[4.5rem]" : "ml-[3rem]"}`}>
          <div className="flex items-center gap-1.5 text-primary select-none">
            <Activity className="w-4 h-4" />
            <span className="font-mono font-medium text-xs uppercase tracking-wider">Monitoring</span>
          </div>
          
          <div className="h-4 w-px bg-border/80"></div>

          <div className="flex flex-row items-center gap-6 text-muted-foreground whitespace-nowrap">
            <label className="flex items-center gap-2 cursor-pointer font-mono text-[13px] hover:text-foreground transition-colors">
              <Checkbox checked={settings.enabled} onCheckedChange={(c: boolean) => updateSetting("enabled", c)} />
              <span>Enable</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-mono text-[13px] hover:text-foreground transition-colors">
              <Checkbox checked={settings.autoRestart} onCheckedChange={(c: boolean) => updateSetting("autoRestart", c)} />
              <span>Auto-Restart</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer font-mono text-[13px] hover:text-foreground transition-colors">
              <Checkbox checked={settings.monitorLogs} onCheckedChange={(c: boolean) => updateSetting("monitorLogs", c)} />
              <span>Monitor Logs</span>
            </label>

            <div className="flex items-center gap-2 ml-2">
              <span className="font-mono text-[12px] opacity-70">Patterns:</span>
              <Input 
                value={settings.logPatterns}
                onChange={(e) => updateSetting("logPatterns", e.target.value)}
                className="h-7 px-2 py-1 text-[12px] font-mono w-56 bg-background/50 border-muted-foreground/30 focus-visible:ring-1 focus-visible:ring-primary/40 rounded-sm"
                placeholder="error, panic..."
              />
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
};

export default function Containers() {
"""

# Insert the component above the Containers component
content = re.sub(r'export default function Containers\(\) \{', COMPONENT, content)

# Remove all current {expandedMonitoring[container.id] && (...)} blocks and replace with the new component
# We have to be careful with the exact regex since the block spans multiple lines.
old_block_pattern = r'\{expandedMonitoring\[container\.id\] && \(\s*<tr className="bg-muted\/10[^\}]+</Fragment>'

# The first replacement in the "group" block (isGroupItem = true)
content = re.sub(
    r'\{expandedMonitoring\[container\.id\] && \(\s*<tr className="bg-muted/10 border-b border-border/50">.*?</tr>\s*\)\}\s*</Fragment>',
    r'{expandedMonitoring[container.id] && <MonitoringRow container={container} isGroupItem={true} />}\n                          </Fragment>',
    content,
    flags=re.DOTALL,
    count=1
)

# The second replacement in the "container" block (isGroupItem = false)
content = re.sub(
    r'\{expandedMonitoring\[container\.id\] && \(\s*<tr className="bg-muted/10 border-b border-border/50">.*?</tr>\s*\)\}\s*</Fragment>',
    r'{expandedMonitoring[container.id] && <MonitoringRow container={container} />}\n                </Fragment>',
    content,
    flags=re.DOTALL,
    count=1
)

with open("src/pages/Containers.tsx", "w") as f:
    f.write(content)
print("Updated Containers.tsx")
