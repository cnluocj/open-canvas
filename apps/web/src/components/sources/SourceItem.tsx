import { useState } from "react";
import { Source } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Link as LinkIcon,
  FileCode,
  ChevronDown,
  ChevronRight,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceItemProps {
  source: Source;
  onToggle: () => void;
  onRemove: () => void;
}

// Get icon based on source type
function getSourceIcon(source: Source) {
  switch (source.type) {
    case "file":
      return <FileText className="size-4 text-blue-600" />;
    case "link":
      return <LinkIcon className="size-4 text-green-600" />;
    case "text":
      return <FileCode className="size-4 text-purple-600" />;
  }
}

// Get source metadata display
function getSourceMetadata(source: Source) {
  switch (source.type) {
    case "file":
      const sizeMB = (source.metadata.size / 1024 / 1024).toFixed(2);
      return `${sizeMB} MB`;
    case "link":
      return source.metadata.url;
    case "text":
      const charCount = source.content.length;
      return `${charCount.toLocaleString()} 字符`;
  }
}

export function SourceItem({ source, onToggle, onRemove }: SourceItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors",
        !source.enabled && "opacity-60"
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={source.enabled}
          onCheckedChange={onToggle}
          className="mt-1"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {getSourceIcon(source)}
            <h4 className="font-medium text-sm truncate">{source.name}</h4>
          </div>

          <p className="text-xs text-gray-500 truncate">
            {getSourceMetadata(source)}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={onRemove}
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="mt-3 pt-3 border-t text-xs text-gray-600">
          <div className="max-h-32 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300">
            <p className="whitespace-pre-wrap break-words">
              {source.content.substring(0, 500)}
              {source.content.length > 500 && "..."}
            </p>
          </div>

          {source.type === "link" && source.metadata.url && (
            <a
              href={source.metadata.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline mt-2 block"
            >
              访问原网页 →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
