import { useMemo, useState } from "react";
import { Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContainerInspectView } from "@/lib/api/types";

interface ContainerInspectTabProps {
  inspect: ContainerInspectView;
}

export function ContainerInspectTab({ inspect }: ContainerInspectTabProps) {
  const [filter, setFilter] = useState("");
  const rawJson = useMemo(() => JSON.stringify(inspect.raw, null, 2), [inspect.raw]);
  const filteredJson = useMemo(() => {
    if (!filter.trim()) {
      return rawJson;
    }

    return rawJson
      .split("\n")
      .filter((line) => line.toLowerCase().includes(filter.toLowerCase()))
      .join("\n");
  }, [filter, rawJson]);

  return (
    <div className="space-y-4 rounded-md border border-border bg-card p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-mono text-sm font-semibold">Inspect JSON</h2>
          <p className="mt-1 font-mono text-xs text-muted-foreground">Formatted inspect payload from the selected engine.</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 font-mono text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(rawJson);
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy JSON
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter inspect keys..."
          className="h-9 border-border bg-background pl-9 font-mono text-sm"
        />
      </div>

      <pre className="max-h-[28rem] overflow-auto rounded-md border border-border/70 bg-background/70 p-4 font-mono text-[11px] leading-5 text-foreground">
        {filteredJson || "// No inspect lines match the current filter"}
      </pre>
    </div>
  );
}
