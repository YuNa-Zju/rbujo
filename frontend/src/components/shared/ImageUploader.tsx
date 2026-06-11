import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { entryService } from "../../services/entryService";

interface Props {
  onUploadSuccess: (markdown: string) => void;
}

export default function ImageUploader({ onUploadSuccess }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const stored = await entryService.uploadFile(file);
      onUploadSuccess(`\n![image](${stored.url})\n`);
    } catch (error) {
      console.error("Upload failed:", error);
      alert("图片上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/png, image/jpeg, image/gif, image/webp"
        onChange={handleFileChange}
      />
      <button
        className="btn btn-sm btn-square btn-ghost hover:text-primary"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title="Upload Image"
      >
        {uploading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ImagePlus size={16} />
        )}
      </button>
    </>
  );
}
