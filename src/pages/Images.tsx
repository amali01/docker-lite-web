import { Fragment, useEffect, useMemo, useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Copy, Download, Image as ImageIcon, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useImages, usePullImage, useRemoveImage } from "@/hooks/use-images";
import { ImageSummary } from "@/lib/api/types";

type ImageRowEntry =
  | { type: "group"; project: string; images: ImageSummary[] }
  | { type: "image"; image: ImageSummary };

function inferComposeProject(image: ImageSummary) {
  if (image.repository === "<none>") return null;

  const repoParts = image.repository.split("/");
  const baseName = repoParts[repoParts.length - 1];

  const normalizedName = baseName.replace(/_/g, "-");
  const parts = normalizedName.split("-").filter(Boolean);

  if (parts.length >= 3 && /^\d+$/.test(parts.at(-1) ?? "")) {
    return parts.slice(0, -2).join("-");
  }

  if (parts.length >= 2) {
    return parts.slice(0, -1).join("-");
  }

  return null;
}

export default function Images() {
  const [filter, setFilter] = useState("");
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const imagesQuery = useImages();
  const pullMutation = usePullImage();
  const removeMutation = useRemoveImage();

  const images = imagesQuery.data ?? [];
  const filtered = images.filter(
    (image) =>
      image.repository.toLowerCase().includes(filter.toLowerCase()) ||
      image.tag.toLowerCase().includes(filter.toLowerCase()),
  );
  const selection = useTableSelection(filtered.map((image) => image.id));

  const selectedImages = images.filter((image) => selection.selectedIds.includes(image.id));
  const hasSelection = selection.selectedCount > 0;

  const rowEntries = useMemo(() => {
    const composeGroups = new Map<string, ImageSummary[]>();

    for (const image of filtered) {
      const project = inferComposeProject(image);

      if (project) {
        composeGroups.set(project, [...(composeGroups.get(project) ?? []), image]);
      }
    }

    const seenGroups = new Set<string>();
    const entries: ImageRowEntry[] = [];

    for (const image of filtered) {
      const project = inferComposeProject(image);

      if (project && (composeGroups.get(project)?.length ?? 0) > 1) {
        if (!seenGroups.has(project)) {
          entries.push({ type: "group", project, images: composeGroups.get(project)! });
          seenGroups.add(project);
        }
        continue;
      }

      entries.push({ type: "image", image });
    }

    return entries;
  }, [filtered]);

  const visibleGroupIds = useMemo(
    () => rowEntries.filter((entry): entry is Extract<ImageRowEntry, { type: "group" }> => entry.type === "group").map((entry) => entry.project),
    [rowEntries],
  );

  useEffect(() => {
    setExpandedGroups((current) => {
      const next: Record<string, boolean> = {};
      let changed = false;

      for (const groupId of visibleGroupIds) {
        next[groupId] = current[groupId] ?? true;
        if (next[groupId] !== current[groupId]) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [visibleGroupIds]);

  if (imagesQuery.isLoading) {
    return (
      <div className="p-6">
        <ApiState title="Loading images" description="DockLite is fetching the local image cache." />
      </div>
    );
  }

  if (imagesQuery.error) {
    return (
      <div className="p-6">
        <ApiState title="Unable to load images" description="The backend could not list Docker images." />
      </div>
    );
  }

  const handleBulkAction = async (action: "remove") => {
    if (selectedImages.length === 0) return;
    try {
      for (const image of selectedImages) {
        await removeMutation.mutateAsync(image.id);
      }
      selection.toggleAll(false);
      toast.success(`Removed selected images`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bulk action failed");
    }
  };

  const handleGroupAction = async (action: "remove", project: string, items: ImageSummary[]) => {
    try {
      for (const item of items) {
        await removeMutation.mutateAsync(item.id);
      }
      toast.success(`Removed images for ${project}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Group action failed");
    }
  };

  const toggleGroup = (project: string) => setExpandedGroups((c) => ({ ...c, [project]: !c[project] }));

  const groupSelectionState = (items: ImageSummary[]) => {
    const selected = items.filter((item) => selection.selectedIds.includes(item.id)).length;
    return {
      allSelected: selected === items.length && items.length > 0,
      partiallySelected: selected > 0 && selected < items.length,
    };
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Images</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{images.length} images</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs w-full sm:w-auto" onClick={() => setPullDialogOpen(true)}>
          <Download className="w-3.5 h-3.5" /> Pull Image
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Filter images..." value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
        </div>
        {hasSelection && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 h-9 py-0 md:ml-auto">
            <span className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
              {selection.selectedCount} selected
            </span>
            <button type="button" onClick={() => void handleBulkAction("remove")} className="inline-flex h-9 w-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90" title="Delete selected"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs md:min-w-[48rem]">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="w-10 p-3">
                <Checkbox aria-label="Select all" checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => selection.toggleAll(checked === true)} />
              </th>
              <th className="text-left p-3">Repository</th>
              <th className="text-left p-3 hidden sm:table-cell">Tag</th>
              <th className="text-left p-3 hidden md:table-cell">Image ID</th>
              <th className="text-left p-3 hidden lg:table-cell">Size</th>
              <th className="text-left p-3 hidden lg:table-cell">Created</th>
              <th className="text-right p-3 sticky right-0 bg-card z-20 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rowEntries.map((entry) => {
              if (entry.type === "group") {
                const groupState = groupSelectionState(entry.images);
                return (
                  <Fragment key={`group-${entry.project}`}>
                    <tr className="group border-b border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Checkbox checked={groupState.allSelected ? true : groupState.partiallySelected ? "indeterminate" : false} onCheckedChange={(checked) => { entry.images.forEach((i) => selection.toggleOne(i.id, checked === true)); }} />
                      </td>
                      <td className="p-3">
                        <button onClick={() => toggleGroup(entry.project)} className="flex items-center gap-2 text-left">
                          {expandedGroups[entry.project] ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                          <Boxes className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-mono font-medium text-foreground">{entry.project}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">Compose Stack • {entry.images.length} images</div>
                          </div>
                        </button>
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell">—</td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">—</td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">—</td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">—</td>
                      <td className="p-3 sticky right-0 bg-muted z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted transition-colors">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => void handleGroupAction("remove", entry.project, entry.images)} className="rounded p-1.5 text-destructive transition-colors hover:bg-destructive/10" title="Delete stack images">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedGroups[entry.project] && entry.images.map((image) => (
                      <tr key={image.id} className="group border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3"><Checkbox checked={selection.selectedIds.includes(image.id)} onCheckedChange={(checked) => selection.toggleOne(image.id, checked === true)} /></td>
                        <td className="p-3 font-mono text-foreground pl-8">
                          <div className="flex items-center gap-2">
                            <ImageIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span style={{maxWidth:"20ch",display:"inline-block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={`${image.repository}:${image.tag}`}>{image.repository}<span className="sm:hidden text-muted-foreground">:{image.tag}</span></span>
                          </div>
                        </td>
                        <td className="p-3 hidden sm:table-cell"><span className="font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{(typeof image.tag === "string" && image.tag.length > 20) ? image.tag.substring(0, 20) + "…" : image.tag}</span></td>
                        <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">{image.id.slice(0, 19)}</td>
                        <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{image.size}</td>
                        <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{image.created}</td>
                        <td className="p-3 sticky right-0 bg-card z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => { navigator.clipboard.writeText(image.id); toast.success("Copied ID"); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Copy ID"><Copy className="w-3.5 h-3.5" /></button>
                            <button onClick={async () => { try { await removeMutation.mutateAsync(image.id); toast.success(`Removed ${image.repository}:${image.tag}`); } catch (e) { toast.error("Error removing image"); } }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              }
              const image = entry.image;
              return (
                <tr key={image.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                  <td className="p-3"><Checkbox checked={selection.selectedIds.includes(image.id)} onCheckedChange={(checked) => selection.toggleOne(image.id, checked === true)} /></td>
                  <td className="p-3 font-mono font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span style={{maxWidth:"20ch",display:"inline-block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={`${image.repository}:${image.tag}`}>{image.repository}<span className="sm:hidden text-muted-foreground">:{image.tag}</span></span>
                    </div>
                  </td>
                  <td className="p-3 hidden sm:table-cell"><span className="font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{(typeof image.tag === "string" && image.tag.length > 20) ? image.tag.substring(0, 20) + "…" : image.tag}</span></td>
                  <td className="p-3 font-mono text-muted-foreground hidden md:table-cell">{image.id.slice(0, 19)}</td>
                  <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{image.size}</td>
                  <td className="p-3 font-mono text-muted-foreground hidden lg:table-cell">{image.created}</td>
                  <td className="p-3 sticky right-0 bg-card z-10 shadow-[-12px_0_16px_-16px_rgba(0,0,0,0.85)] border-l group-hover:bg-muted">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { navigator.clipboard.writeText(image.id); toast.success("Copied ID"); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Copy ID"><Copy className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { try { await removeMutation.mutateAsync(image.id); toast.success(`Removed ${image.repository}:${image.tag}`); } catch (e) { toast.error("Error removing image"); } }} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <PromptDialog open={pullDialogOpen} title="Pull Image" label="Image" placeholder="e.g. postgres:16" confirmLabel="Pull Image" pending={pullMutation.isPending} onOpenChange={setPullDialogOpen} onSubmit={async (value) => { try { const image = await pullMutation.mutateAsync({ image: value }); toast.success(`Pulled ${image.repository}:${image.tag}`); } catch (e) { toast.error("Unable to pull image"); throw e; } }} />
    </div>
  );
}
