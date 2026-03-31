import { NavLink, useLocation } from "react-router-dom";
import { Box, HardDrive, LayoutDashboard, Network, Image, Settings } from "lucide-react";
import { useEngineInfo } from "@/hooks/use-engine";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/containers", icon: Box, label: "Containers" },
  { to: "/images", icon: Image, label: "Images" },
  { to: "/volumes", icon: HardDrive, label: "Volumes" },
  { to: "/networks", icon: Network, label: "Networks" },
];

interface AppSidebarProps {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

export function AppSidebar({ variant = "desktop", onNavigate }: AppSidebarProps) {
  const location = useLocation();
  const engineQuery = useEngineInfo();
  const isConnected = engineQuery.data?.connected ?? false;
  const isMobile = variant === "mobile";

  return (
    <aside
      className={cn(
        "bg-sidebar flex flex-col",
        isMobile ? "h-full w-full" : "h-screen w-56 shrink-0 border-r border-sidebar-border",
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center" aria-label="DockLite mark">
            <img src="/container-logo.svg" alt="DockLite logo" className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-mono font-bold text-sidebar-accent-foreground tracking-tight">DockLite</h1>
            <p className="text-[10px] text-muted-foreground font-mono">Docker GUI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
            location.pathname === '/settings'
              ? "bg-sidebar-accent text-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </NavLink>
        <div className="mt-3 px-3">
          <div className="flex items-center gap-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-success animate-pulse-dot" : "bg-destructive")} />
            <span className="text-[10px] font-mono text-muted-foreground">
              {engineQuery.isLoading ? "Checking engine..." : isConnected ? "Engine connected" : "Engine disconnected"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
