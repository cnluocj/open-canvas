import { motion } from "framer-motion";
import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { useToast } from "@/hooks/use-toast";
import { isArtifactCodeContent } from "@opencanvas/shared/utils/artifacts";
import { ArtifactCodeV3, ArtifactMarkdownV3 } from "@opencanvas/shared/types";
import { Copy } from "lucide-react";

interface CopyTextProps {
  currentArtifactContent: ArtifactCodeV3 | ArtifactMarkdownV3;
}

export function CopyText(props: CopyTextProps) {
  const { toast } = useToast();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <TooltipIconButton
        tooltip="复制"
        variant="outline"
        className="transition-colors"
        delayDuration={400}
        onClick={() => {
          try {
            const text = isArtifactCodeContent(props.currentArtifactContent)
              ? props.currentArtifactContent.code
              : props.currentArtifactContent.fullMarkdown;
            navigator.clipboard.writeText(text).then(() => {
              toast({
                title: "已复制到剪贴板",
                description: "画布内容已复制。",
                duration: 5000,
              });
            });
          } catch (_) {
            toast({
              title: "复制失败",
              description: "无法复制画布内容，请重试。",
              duration: 5000,
            });
          }
        }}
      >
        <Copy className="w-5 h-5 text-gray-600" />
      </TooltipIconButton>
    </motion.div>
  );
}
