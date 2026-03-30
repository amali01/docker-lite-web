import { NavLink, useLocation } from "react-router-dom";
import { Box, Container, HardDrive, LayoutDashboard, Network, Image, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/containers", icon: Box, label: "Containers" },
  { to: "/images", icon: Image, label: "Images" },
  { to: "/volumes", icon: HardDrive, label: "Volumes" },
  { to: "/networks", icon: Network, label: "Networks" },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="w-56 h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <Container className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-mono font-bold text-sidebar-accent-foreground tracking-tight">DockLite</h1>
            <p className="text-[10px] text-muted-foreground font-mono">Docker GUI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
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
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
            <span className="text-[10px] font-mono text-muted-foreground">Engine connected</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
