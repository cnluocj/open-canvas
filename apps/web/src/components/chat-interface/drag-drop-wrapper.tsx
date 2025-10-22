import React, { DragEvent } from "react";
import { useComposer, useComposerRuntime } from "@assistant-ui/react";
import { useToast } from "@/hooks/use-toast";

interface DragAndDropWrapperProps {
  children: React.ReactNode;
}

export function DragAndDropWrapper({ children }: DragAndDropWrapperProps) {
  const { toast } = useToast();
  const disabled = useComposer((c) => !c.isEditing);
  const composerRuntime = useComposerRuntime();

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!disabled) {
      try {
        const files = Array.from(e.dataTransfer.files);
        const attachmentAccept = composerRuntime.getAttachmentAccept();
        const addAttachmentPromises = files.map(async (file) => {
          if (
            attachmentAccept === "*" ||
            attachmentAccept.split(",").some((t) => t.trim() === file.type)
          ) {
            await composerRuntime.addAttachment(file);
          } else {
            toast({
              title: "文件类型不兼容",
              description: (
                <div className="flex flex-col gap-1 text-pretty">
                  <p>文件 {file.name} 不受支持。</p>
                  <p>
                    接收到的类型为{" "}
                    <span className="font-mono">{file.type}</span>，必须是以下类型之一：
                  </p>
                  <p className="font-mono text-wrap">
                    {attachmentAccept.split(",").join(", ")}
                  </p>
                </div>
              ),
              variant: "destructive",
              duration: 5000,
            });
          }
        });

        await Promise.all(addAttachmentPromises);
      } catch (e) {
        console.error(e);
        toast({
          title: "错误",
          description: "添加附件失败，可能是由于文件类型不兼容。",
          variant: "destructive",
          duration: 5000,
        });
      }
    } else {
      toast({
        title: "拖放功能已禁用",
        description: "当前模式下无法拖放，请稍后再试。",
        duration: 5000,
      });
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      {children}
    </div>
  );
}
