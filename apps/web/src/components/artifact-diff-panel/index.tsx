import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ARTIFACT_DIFF_QUERY_PARAM } from "@/constants";
import { useGraphContext } from "@/contexts/GraphContext";
import { ArtifactDiffInfo } from "@opencanvas/shared/types";
import { TighterText } from "../ui/header";
import { TooltipIconButton } from "../assistant-ui/tooltip-icon-button";
import { X, FileText } from "lucide-react";
import { useQueryState } from "nuqs";
import { Diff, Hunk } from "react-diff-view";
import { diffLines, Change } from "diff";
import "react-diff-view/style/index.css";

interface ArtifactDiffPanelProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

export function ArtifactDiffPanel({
  open,
  setOpen,
}: ArtifactDiffPanelProps) {
  const [diffInfo, setDiffInfo] = useState<ArtifactDiffInfo | null>(null);
  const [diffFiles, setDiffFiles] = useState<any[]>([]);
  const [stats, setStats] = useState({ additions: 0, deletions: 0 });
  const {
    graphData: { messages, artifact },
  } = useGraphContext();
  const [diffId, setDiffId] = useQueryState(ARTIFACT_DIFF_QUERY_PARAM);

  useEffect(() => {
    if (!diffId && open) {
      setOpen(false);
      setDiffInfo(null);
      setDiffFiles([]);
      return;
    }
    if (!diffId || !messages.length || !artifact) {
      return;
    }

    // 查找包含 diffInfo 的消息
    const diffMessage = messages.find((message) => message.id === diffId);
    if (!diffMessage) {
      return;
    }

    const diffInfoData = diffMessage.additional_kwargs
      ?.artifactDiffInfo as ArtifactDiffInfo | undefined;

    if (!diffInfoData) {
      return;
    }

    setDiffInfo(diffInfoData);

    // 获取当前版本和上一版本的内容
    const currentContent = artifact.contents.find(
      (c) => c.index === diffInfoData.artifactIndex
    );
    const previousContent =
      diffInfoData.changeType === "update"
        ? artifact.contents.find((c) => c.index === diffInfoData.previousIndex)
        : null;

    if (!currentContent) {
      return;
    }

    // 准备 diff 内容
    let oldText = "";
    let newText = "";
    const fileName = currentContent.title || "Untitled";

    if (currentContent.type === "code") {
      newText = currentContent.code;
      oldText = previousContent?.type === "code" ? previousContent.code : "";
    } else {
      newText = currentContent.fullMarkdown;
      oldText =
        previousContent?.type === "text" ? previousContent.fullMarkdown : "";
    }

    // 如果是创建操作，旧内容为空
    if (diffInfoData.changeType === "create") {
      oldText = "";
    }

    // 计算 diff
    try {
      const changes = diffLines(oldText, newText);

      // 构建 hunks 结构
      const hunks: any[] = [];
      let oldLineNumber = 1;
      let newLineNumber = 1;
      const hunkChanges: any[] = [];

      let additions = 0;
      let deletions = 0;

      changes.forEach((change: Change) => {
        const lines = change.value.split('\n').filter(line => line !== '' || change.value.endsWith('\n'));

        if (change.added) {
          lines.forEach((line) => {
            hunkChanges.push({
              type: 'insert',
              content: line,
              oldLineNumber: undefined,
              newLineNumber: newLineNumber++,
            });
            additions++;
          });
        } else if (change.removed) {
          lines.forEach((line) => {
            hunkChanges.push({
              type: 'delete',
              content: line,
              oldLineNumber: oldLineNumber++,
              newLineNumber: undefined,
            });
            deletions++;
          });
        } else {
          lines.forEach((line) => {
            hunkChanges.push({
              type: 'normal',
              content: line,
              oldLineNumber: oldLineNumber++,
              newLineNumber: newLineNumber++,
            });
          });
        }
      });

      if (hunkChanges.length > 0) {
        hunks.push({
          oldStart: 1,
          oldLines: oldLineNumber - 1,
          newStart: 1,
          newLines: newLineNumber - 1,
          content: '@@ -1,' + (oldLineNumber - 1) + ' +1,' + (newLineNumber - 1) + ' @@',
          changes: hunkChanges,
        });
      }

      const file = {
        oldPath: fileName,
        newPath: fileName,
        oldRevision: 'previous',
        newRevision: 'current',
        type: 'modify',
        hunks: hunks,
      };

      setDiffFiles([file]);
      setStats({ additions, deletions });
      setOpen(true);
    } catch (error) {
      console.error("Error generating diff:", error);
    }
  }, [diffId, messages, artifact]);

  const handleClose = () => {
    setOpen(false);
    setDiffInfo(null);
    setDiffFiles([]);
    setDiffId(null);
  };

  const renderDiffFile = (file: any, index: number) => {
    return (
      <div key={index} className="border rounded-lg overflow-hidden bg-white flex flex-col h-full">
        <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-gray-500" />
            <span className="text-sm font-medium">{file.newPath}</span>
          </div>
          <div className="flex gap-3 text-xs">
            <span className="text-green-600 font-medium">
              +{stats.additions}
            </span>
            <span className="text-red-600 font-medium">-{stats.deletions}</span>
          </div>
        </div>
        <div className="overflow-auto flex-1">
          <Diff
            viewType="split"
            diffType={file.type}
            hunks={file.hunks || []}
          >
            {(hunks: any[]) =>
              hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
            }
          </Diff>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="flex flex-col gap-6 w-full max-w-2xl p-5 border-l-[1px] border-gray-200 shadow-inner-left h-screen overflow-hidden bg-gray-50/50"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
          }}
        >
          <div className="flex justify-between items-center w-full">
            <div className="flex flex-col">
              <TighterText className="text-lg font-medium">
                Document Changes
              </TighterText>
              {diffInfo && (
                <span className="text-sm text-gray-500">
                  {diffInfo.changeType === "create"
                    ? "Initial version"
                    : `Version ${diffInfo.previousIndex} → ${diffInfo.artifactIndex}`}
                </span>
              )}
            </div>
            <TooltipIconButton
              tooltip="Close"
              variant="ghost"
              onClick={handleClose}
            >
              <X className="size-4" />
            </TooltipIconButton>
          </div>

          <motion.div
            className="flex flex-col gap-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100 flex-1 min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {diffFiles.length > 0 ? (
              <div className="flex-1 flex flex-col min-h-0">
                {diffFiles.map((file, index) => renderDiffFile(file, index))}
              </div>
            ) : diffInfo?.changeType === "create" ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <FileText className="size-12 mx-auto mb-2 opacity-50" />
                  <p>This is the initial version</p>
                  <p className="text-sm mt-1">No changes to compare</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <p>Loading diff...</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
