import { useState } from "react";
import { Copy, Download, Image, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiState } from "@/components/ApiState";
import { PromptDialog } from "@/components/PromptDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useTableSelection } from "@/hooks/use-table-selection";
import { useImages, usePullImage, useRemoveImage } from "@/hooks/use-images";

export default function Images() {
  const [filter, setFilter] = useState("");
  const [pullDialogOpen, setPullDialogOpen] = useState(false);
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Images</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{images.length} images</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs" onClick={() => setPullDialogOpen(true)}>
          <Download className="w-3.5 h-3.5" /> Pull Image
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Filter images..." value={filter} onChange={(event) => setFilter(event.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="w-10 p-3">
                <Checkbox
                  aria-label="Select all images"
                  checked={selection.allSelected ? true : selection.partiallySelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => selection.toggleAll(checked === true)}
                />
              </th>
              <th className="text-left p-3">Repository</th>
              <th className="text-left p-3">Tag</th>
              <th className="text-left p-3">Image ID</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Created</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((image) => (
              <tr key={image.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                <td className="p-3">
                  <Checkbox
                    aria-label={`Select image ${image.repository}:${image.tag}`}
                    checked={selection.selectedIds.includes(image.id)}
                    onCheckedChange={(checked) => selection.toggleOne(image.id, checked === true)}
                  />
                </td>
                <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2">
                  <Image className="w-3.5 h-3.5 text-primary" />
                  {image.repository}
                </td>
                <td className="p-3"><span className="font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{image.tag}</span></td>
                <td className="p-3 font-mono text-muted-foreground">{image.id.slice(0, 19)}</td>
                <td className="p-3 font-mono text-muted-foreground">{image.size}</td>
                <td className="p-3 font-mono text-muted-foreground">{image.created}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(image.id);
                        toast.success("Copied ID");
                      }}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      title="Copy ID"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await removeMutation.mutateAsync(image.id);
                          toast.success(`Removed ${image.repository}:${image.tag}`);
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Unable to remove image");
                        }
                      }}
                      className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PromptDialog
        open={pullDialogOpen}
        title="Pull Image"
        label="Image"
        placeholder="e.g. postgres:16"
        confirmLabel="Pull Image"
        pending={pullMutation.isPending}
        onOpenChange={setPullDialogOpen}
        onSubmit={async (value) => {
          try {
            const image = await pullMutation.mutateAsync({ image: value });
            toast.success(`Pulled ${image.repository}:${image.tag}`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to pull image");
            throw error;
          }
        }}
      />
    </div>
  );
}
