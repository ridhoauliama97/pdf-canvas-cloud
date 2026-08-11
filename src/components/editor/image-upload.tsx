import { useCallback, useState } from "react";
import { Upload, Loader2, X, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImageUploadProps {
  /** Current image URL */
  value: string;
  /** Callback when URL changes */
  onChange: (url: string) => void;
  /** Storage bucket path prefix (defaults to "images") */
  bucketPath?: string;
}

/**
 * Image upload component for the property inspector.
 *
 * Supports two modes:
 * 1. File upload — stores to `reportflow-bucket/{company_id}/images/`
 * 2. URL input — manual paste of an external image URL
 */
export function ImageUpload({ value, onChange, bucketPath = "images" }: ImageUploadProps) {
  const { workspace } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!workspace) {
        toast.error("No workspace selected");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are supported");
        return;
      }

      setUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "png";
        const path = `${workspace.id}/${bucketPath}/${Date.now()}.${ext}`;

        const { error } = await supabase.storage.from("reportflow-bucket").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) throw error;

        const { data: urlData } = supabase.storage.from("reportflow-bucket").getPublicUrl(path);

        // Fall back to signed URL if bucket is private
        const publicUrl = urlData?.publicUrl;
        if (publicUrl) {
          onChange(publicUrl);
        } else {
          const { data: signed, error: signedErr } = await supabase.storage
            .from("reportflow-bucket")
            .createSignedUrl(path, 3600);
          if (signedErr) throw signedErr;
          onChange(signed.signedUrl);
        }

        toast.success("Image uploaded");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [workspace, bucketPath, onChange],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) uploadFile(file);
      // Reset so same file can be re-selected
      event.target.value = "";
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  return (
    <div className="space-y-3">
      {/* Preview */}
      {value && (
        <div className="group relative overflow-hidden rounded-md border border-border">
          <img src={value} alt="Uploaded" className="h-32 w-full object-contain bg-surface-2/50" />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100"
            onClick={() => onChange("")}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Upload drop zone */}
      <div
        className={`flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {uploading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <Upload className="size-5 text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">
              Drop an image or{" "}
              <label className="cursor-pointer text-primary hover:underline">
                browse
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>
            </p>
          </>
        )}
      </div>

      {/* URL fallback */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LinkIcon className="size-3" />
          Or paste image URL
        </Label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://… or {{company.logo}}"
        />
      </div>
    </div>
  );
}
