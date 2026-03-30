import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  accent?: boolean;
}

export function StatCard({ label, value, icon: Icon, subtitle, accent }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <p className="text-2xl font-mono font-bold text-card-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
