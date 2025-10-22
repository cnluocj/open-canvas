import { TighterText } from "@/components/ui/header";
import { InlineContextTooltip } from "@/components/ui/inline-context-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALLOWED_AUDIO_TYPES, ALLOWED_VIDEO_TYPES } from "@/constants";
import { LoaderCircle, Plus, X } from "lucide-react";
import { UploadedFiles } from "./uploaded-file";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const ContextDocumentsWhatsThis = (): React.ReactNode => (
  <span className="flex flex-col gap-1 text-sm text-gray-600">
    <p className="text-sm text-gray-600">
      上下文文档会在生成、改写和编辑作品时加入 LLM 的上下文，除了快捷操作以外的所有交互都会使用这些文本或 PDF 文件。
    </p>
  </span>
);

interface ContextDocumentsProps {
  documents: FileList | undefined;
  setDocuments: React.Dispatch<React.SetStateAction<FileList | undefined>>;
  loadingDocuments: boolean;
  allDisabled: boolean;
  handleRemoveFile: (index: number) => void;
  urls: string[];
  setUrls: React.Dispatch<React.SetStateAction<string[]>>;
}

interface UrlInputRowProps {
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  onAdd: () => void;
  isLast: boolean;
  disabled: boolean;
}

function UrlInputRow({
  value,
  onChange,
  onRemove,
  onAdd,
  isLast,
  disabled,
}: UrlInputRowProps) {
  return (
    <div className="flex gap-2 items-center">
      <Input
        type="url"
        placeholder="输入链接"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1"
        disabled={disabled}
      />
      {isLast && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onAdd}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function ContextDocuments(props: ContextDocumentsProps) {
  const {
    documents,
    setDocuments,
    loadingDocuments,
    allDisabled,
    handleRemoveFile,
    urls,
    setUrls,
  } = props;

  const [showUrlInputs, setShowUrlInputs] = useState(urls.length > 0);

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...urls];
    newUrls[index] = value;
    setUrls(newUrls);
  };

  const handleUrlRemove = (index: number) => {
    const newUrls = urls.filter((_, i) => i !== index);
    setUrls(newUrls);
    if (newUrls.length === 0) {
      setShowUrlInputs(false);
    }
  };

  const handleUrlAdd = () => {
    setUrls([...urls, ""]);
  };

  return (
    <div className="flex flex-col items-start justify-start gap-4 w-full">
      <Label htmlFor="context-documents">
        <TighterText className="flex items-center">
          上下文文档{" "}
          <span className="text-gray-600 text-sm ml-1">
            （最多 20 个文件：文档单个 10MB、音频 25MB、视频 1GB）
          </span>
          <InlineContextTooltip cardContentClassName="w-[500px] ml-10">
            <ContextDocumentsWhatsThis />
          </InlineContextTooltip>
        </TighterText>
      </Label>
      <Input
        disabled={allDisabled}
        required={false}
        id="context-documents"
        type="file"
        multiple
        accept=".txt,.md,.json,.xml,.css,.html,.csv,.pdf,.doc,.docx,.mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm"
        onChange={(e) => {
          const newFiles = e.target.files;
          if (!newFiles) return;

          // Create array from existing files if any
          const existingFiles = documents ? Array.from(documents) : [];
          const totalFileCount = existingFiles.length + newFiles.length;

          if (totalFileCount > 20) {
            alert("最多只能上传 20 个文件");
            e.target.value = "";
            return;
          }

          // Size limits in bytes
          const tenMbBytes = 10 * 1024 * 1024; // 10MB for documents
          const twentyFiveMbBytes = 25 * 1024 * 1024; // 25MB for audio
          const oneGbBytes = 1024 * 1024 * 1024; // 1GB for video

          for (let i = 0; i < newFiles.length; i += 1) {
            const file = newFiles[i];
            const isAudio = ALLOWED_AUDIO_TYPES.has(file.type);
            const isVideo = ALLOWED_VIDEO_TYPES.has(file.type);

            // Check size limits based on file type
            if (isAudio && file.size > twentyFiveMbBytes) {
              alert(`音频文件 "${file.name}" 超过了 25MB 的大小限制`);
              e.target.value = "";
              return;
            } else if (isVideo && file.size > oneGbBytes) {
              alert(`视频文件 "${file.name}" 超过了 1GB 的大小限制`);
              e.target.value = "";
              return;
            } else if (!isAudio && !isVideo && file.size > tenMbBytes) {
              alert(`文档 "${file.name}" 超过了 10MB 的大小限制`);
              e.target.value = "";
              return;
            }
          }

          // Merge existing files with new files
          const mergedFiles = [...existingFiles, ...Array.from(newFiles)];

          // Create a new FileList-like object
          const dataTransfer = new DataTransfer();
          mergedFiles.forEach((file) => dataTransfer.items.add(file));

          setDocuments(dataTransfer.files);
          e.target.value = ""; // Reset input to allow selecting the same file again
        }}
      />
      {loadingDocuments && (
        <span className="text-gray-600 text-sm flex gap-2">
          正在加载上下文文档{" "}
          <LoaderCircle className="animate-spin w-4 h-4" />
        </span>
      )}
      <UploadedFiles files={documents} handleRemoveFile={handleRemoveFile} />

      <div className="w-full flex flex-col gap-2">
        {showUrlInputs || urls.length > 0 ? (
          urls.map((url, index) => (
            <UrlInputRow
              key={index}
              value={url}
              onChange={(value) => handleUrlChange(index, value)}
              onRemove={() => handleUrlRemove(index)}
              onAdd={handleUrlAdd}
              isLast={index === urls.length - 1}
              disabled={allDisabled}
            />
          ))
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowUrlInputs(true);
              handleUrlAdd();
            }}
            disabled={allDisabled}
          >
            添加链接
          </Button>
        )}
      </div>
    </div>
  );
}
