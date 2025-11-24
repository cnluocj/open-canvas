import { Source } from "@/types";
import { SourceItem } from "./SourceItem";

interface SourcesListProps {
  sources: Source[];
  onToggle: (sourceId: string) => void;
  onRemove: (sourceId: string) => void;
}

export function SourcesList({ sources, onToggle, onRemove }: SourcesListProps) {
  return (
    <div className="flex flex-col gap-3">
      {sources.map((source) => (
        <SourceItem
          key={source.id}
          source={source}
          onToggle={() => onToggle(source.id)}
          onRemove={() => onRemove(source.id)}
        />
      ))}
    </div>
  );
}
