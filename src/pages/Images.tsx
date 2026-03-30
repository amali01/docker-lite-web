import { useState } from "react";
import { Image, Trash2, Search, Download, Copy } from "lucide-react";
import { mockImages, DockerImage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function Images() {
  const [filter, setFilter] = useState("");
  const [images, setImages] = useState(mockImages);

  const filtered = images.filter(i =>
    i.repository.toLowerCase().includes(filter.toLowerCase()) ||
    i.tag.toLowerCase().includes(filter.toLowerCase())
  );

  const handleRemove = (img: DockerImage) => {
    setImages(prev => prev.filter(i => i.id !== img.id));
    toast.success(`Removed ${img.repository}:${img.tag}`);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Images</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{images.length} images</p>
        </div>
        <Button size="sm" className="gap-1.5 font-mono text-xs">
          <Download className="w-3.5 h-3.5" /> Pull Image
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Filter images..." value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9 bg-card border-border font-mono text-sm h-9" />
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground font-mono uppercase tracking-wider">
              <th className="text-left p-3">Repository</th>
              <th className="text-left p-3">Tag</th>
              <th className="text-left p-3">Image ID</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Created</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((img) => (
              <tr key={img.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                <td className="p-3 font-mono font-medium text-foreground flex items-center gap-2">
                  <Image className="w-3.5 h-3.5 text-primary" />
                  {img.repository}
                </td>
                <td className="p-3"><span className="font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{img.tag}</span></td>
                <td className="p-3 font-mono text-muted-foreground">{img.id.slice(7, 19)}</td>
                <td className="p-3 font-mono text-muted-foreground">{img.size}</td>
                <td className="p-3 font-mono text-muted-foreground">{img.created}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { navigator.clipboard.writeText(img.id); toast.success("Copied ID"); }} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Copy ID">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleRemove(img)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Remove">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
