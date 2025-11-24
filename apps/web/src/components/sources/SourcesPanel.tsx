"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus } from "lucide-react";
import { TighterText } from "../ui/header";
import { TooltipIconButton } from "../assistant-ui/tooltip-icon-button";
import { Button } from "../ui/button";
import { useSources } from "@/hooks/useSources";
import { useThreadContext } from "@/contexts/ThreadProvider";
import { SourcesList } from "./SourcesList";
import { AddSourceDialog } from "./AddSourceDialog";
import { useToast } from "@/hooks/use-toast";

interface SourcesPanelProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function SourcesPanel({ open, setOpen }: SourcesPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { threadId, createThread } = useThreadContext();
  const {
    sources,
    isLoading,
    loadSources,
    addFileSource,
    addLinkSource,
    addTextSource,
    removeSource,
    toggleSource,
    enabledSourcesCount,
    maxSources,
  } = useSources();

  // Load sources when panel opens or threadId changes
  useEffect(() => {
    if (open && threadId) {
      loadSources(threadId);
    }
  }, [open, threadId, loadSources]);

  const handleClose = () => {
    setOpen(false);
  };

  // Helper function to ensure we have a threadId
  const ensureThreadId = async (): Promise<string | null> => {
    if (threadId) {
      return threadId;
    }

    // Create new thread if not exists
    try {
      const newThread = await createThread();
      if (!newThread?.thread_id) {
        toast({
          title: "创建会话失败",
          description: "请稍后重试",
          variant: "destructive",
        });
        return null;
      }
      return newThread.thread_id;
    } catch (error) {
      console.error("Error creating thread:", error);
      toast({
        title: "创建会话失败",
        description: "请稍后重试",
        variant: "destructive",
      });
      return null;
    }
  };

  // Handle adding file source with threadId check
  const handleAddFile = async (files: File[]) => {
    const currentThreadId = await ensureThreadId();
    if (!currentThreadId) return;

    await addFileSource(currentThreadId, files);
  };

  // Handle adding link source with threadId check
  const handleAddLink = async (url: string) => {
    const currentThreadId = await ensureThreadId();
    if (!currentThreadId) return;

    await addLinkSource(currentThreadId, url);
  };

  // Handle adding text source with threadId check
  const handleAddText = async (text: string, name?: string) => {
    const currentThreadId = await ensureThreadId();
    if (!currentThreadId) return;

    await addTextSource(currentThreadId, text, name);
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="flex flex-col gap-4 w-full max-w-sm p-5 border-l-[1px] border-gray-200 shadow-inner-left h-screen overflow-hidden bg-white"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center w-full">
              <TighterText className="text-lg font-medium">来源</TighterText>
              <TooltipIconButton
                tooltip="关闭"
                variant="ghost"
                onClick={handleClose}
              >
                <X className="size-4" />
              </TooltipIconButton>
            </div>

            {/* Add Source Button */}
            <Button
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="size-4" />
              添加来源
            </Button>

            {/* Sources List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-500">
                  加载中...
                </div>
              ) : sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-gray-500 mb-2">还没有添加来源</p>
                  <p className="text-xs text-gray-400">
                    点击上方按钮添加文件、链接或文本
                  </p>
                </div>
              ) : (
                <SourcesList
                  sources={sources}
                  onToggle={(sourceId) => {
                    if (threadId) {
                      toggleSource(threadId, sourceId);
                    }
                  }}
                  onRemove={(sourceId) => {
                    if (threadId) {
                      removeSource(threadId, sourceId);
                    }
                  }}
                />
              )}
            </div>

            {/* Footer - Source Count */}
            <div className="border-t pt-3 text-xs text-gray-500 text-center">
              {enabledSourcesCount} / {maxSources} 来源已选中
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Source Dialog */}
      <AddSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAddFile={handleAddFile}
        onAddLink={handleAddLink}
        onAddText={handleAddText}
      />
    </>
  );
}
