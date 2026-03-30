interface ApiStateProps {
  title: string;
  description: string;
}

export function ApiState({ title, description }: ApiStateProps) {
  return (
    <div className="bg-card border border-border rounded-md p-4">
      <p className="font-mono text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
