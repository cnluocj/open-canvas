import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Upload, Link as LinkIcon, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TabType = "upload" | "link" | "text";

interface AddSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddFile: (files: File[]) => Promise<void>;
  onAddLink: (url: string) => Promise<void>;
  onAddText: (text: string, name?: string) => Promise<void>;
}

export function AddSourceDialog({
  open,
  onOpenChange,
  onAddFile,
  onAddLink,
  onAddText,
}: AddSourceDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>("upload");
  const [isLoading, setIsLoading] = useState(false);

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Link state
  const [url, setUrl] = useState("");

  // Text state
  const [text, setText] = useState("");
  const [textName, setTextName] = useState("");

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsLoading(true);
    try {
      await onAddFile(Array.from(files));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files);
    }
  };

  const handleAddLink = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    try {
      await onAddLink(url);
      setUrl("");
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddText = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    try {
      await onAddText(text, textName || undefined);
      setText("");
      setTextName("");
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>添加来源</DialogTitle>
          <DialogDescription>
            添加文件、网站链接或粘贴文字作为病案报告的撰写来源
          </DialogDescription>
        </DialogHeader>

        {/* Tab Navigation */}
        <div className="flex border-b">
          <button
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2",
              activeTab === "upload"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
            onClick={() => setActiveTab("upload")}
          >
            <Upload className="size-4 inline mr-2" />
            上传文件
          </button>
          <button
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2",
              activeTab === "link"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
            onClick={() => setActiveTab("link")}
          >
            <LinkIcon className="size-4 inline mr-2" />
            网站
          </button>
          <button
            className={cn(
              "flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2",
              activeTab === "text"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
            onClick={() => setActiveTab("text")}
          >
            <FileText className="size-4 inline mr-2" />
            粘贴文字
          </button>
        </div>

        {/* Tab Content */}
        <div className="py-4">
          {/* Upload File Tab */}
          {activeTab === "upload" && (
            <div className="space-y-4">
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  dragActive
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-300 hover:border-gray-400"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-12 mx-auto mb-4 text-gray-400" />
                <p className="text-sm font-medium mb-2">
                  拖放或选择文件
                  <span className="text-blue-600 ml-1">上传</span>
                </p>
                <p className="text-xs text-gray-500">
                  支持的文件类型：PDF, txt, Markdown, 音频（例如 mp3），.docx, .avif 等
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.txt,.md,.json,.xml,.css,.html,.csv,.doc,.docx"
                  onChange={(e) => handleFileChange(e.target.files)}
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {/* Link Tab */}
          {activeTab === "link" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="url">网站 URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  className="mt-2"
                />
              </div>
              <Button
                onClick={handleAddLink}
                disabled={!url.trim() || isLoading}
                className="w-full"
              >
                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                添加网站
              </Button>
            </div>
          )}

          {/* Text Tab */}
          {activeTab === "text" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="text-name">名称（可选）</Label>
                <Input
                  id="text-name"
                  placeholder="为这段文字命名"
                  value={textName}
                  onChange={(e) => setTextName(e.target.value)}
                  disabled={isLoading}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="text-content">在此处粘贴文字</Label>
                <Textarea
                  id="text-content"
                  placeholder="粘贴或输入文字内容..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={isLoading}
                  className="mt-2 min-h-[200px]"
                />
                <p className="text-xs text-gray-500 mt-2">
                  {text.length.toLocaleString()} 字符
                </p>
              </div>
              <Button
                onClick={handleAddText}
                disabled={!text.trim() || isLoading}
                className="w-full"
              >
                {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                添加文字
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
