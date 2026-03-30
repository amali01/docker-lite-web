import { useState } from "react";
import { Activity } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ContainerSummary } from "@/hooks/use-containers";

export const MonitoringRow = ({ container, isGroupItem = false, isLast = false }: { container: ContainerSummary; isGroupItem?: boolean; isLast?: boolean }) => {
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
      <td colSpan={10} className="py-2.5 px-4 relative">
        {isGroupItem && !isLast && (
          <div className="absolute left-[60px] top-0 -bottom-[1px] w-px bg-primary/50 z-0" />
        )}
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
