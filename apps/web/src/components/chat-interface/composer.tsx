"use client";

import { ComposerPrimitive, ThreadPrimitive } from "@assistant-ui/react";
import { type FC, useState, useEffect } from "react";

import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { SendHorizontalIcon } from "lucide-react";
import { DragAndDropWrapper } from "./drag-drop-wrapper";
import { ComposerAttachments } from "../assistant-ui/attachment";
import { ComposerActionsPopOut } from "./composer-actions-popout";

const GENERIC_PLACEHOLDERS = [
  "输入病案背景，帮你整理首段摘要",
  "概述病程进展，我来补全诊疗细节",
  "记录关键实验室数据，自动生成描述",
  "写下入院主诉，我会协助完善病史",
  "输入治疗方案，快速生成病例总结",
  "告诉我并发症情况，补齐处理经过",
  "描述影像学所见，我来润色报告",
  "写下会诊意见，我们一起完善结论",
  "需要病例结构？输入关键词即可起草",
  "先写初步诊断，我帮你拓展依据",
];

const SEARCH_PLACEHOLDERS = [
  "需要类似病例？输入病种，我来检索文献",
  "告诉我关键词，寻找最新病例报道",
  "想引用指南内容？输入疾病即可搜集",
  "输入并发症名称，快速查找病例证据",
  "要病例对照数据？告诉我研究方向",
  "输入治疗方式，我帮你找成功案例",
  "需要病案模板？说出科室即可推荐",
  "输入罕见病名称，检索相关案例",
  "想引用最新统计？提供病种即可",
  "输入药物名称，获取病例应用参考",
];

const getRandomPlaceholder = (searchEnabled: boolean) => {
  return searchEnabled
    ? SEARCH_PLACEHOLDERS[
        Math.floor(Math.random() * SEARCH_PLACEHOLDERS.length)
      ]
    : GENERIC_PLACEHOLDERS[
        Math.floor(Math.random() * GENERIC_PLACEHOLDERS.length)
      ];
};

const CircleStopIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      width="16"
      height="16"
    >
      <rect width="10" height="10" x="3" y="3" rx="2" />
    </svg>
  );
};

interface ComposerProps {
  chatStarted: boolean;
  userId: string | undefined;
  searchEnabled: boolean;
}

export const Composer: FC<ComposerProps> = (props: ComposerProps) => {
  const [placeholder, setPlaceholder] = useState("");

  useEffect(() => {
    setPlaceholder(getRandomPlaceholder(props.searchEnabled));
  }, [props.searchEnabled]);

  return (
    <DragAndDropWrapper>
      <ComposerPrimitive.Root className="focus-within:border-aui-ring/20 flex flex-col w-full min-h-[64px] flex-wrap items-center justify-center border px-2.5 shadow-sm transition-colors ease-in bg-white rounded-2xl">
        <div className="flex flex-wrap gap-2 items-start mr-auto">
          <ComposerAttachments />
        </div>

        <div className="flex flex-row w-full items-center justify-start my-auto">
          <ComposerActionsPopOut />
          <ComposerPrimitive.Input
            autoFocus
            placeholder={placeholder}
            rows={1}
            className="placeholder:text-muted-foreground max-h-40 flex-grow resize-none border-none bg-transparent px-2 py-4 text-sm outline-none focus:ring-0 disabled:cursor-not-allowed"
          />
          <ThreadPrimitive.If running={false}>
            <ComposerPrimitive.Send asChild>
              <TooltipIconButton
                tooltip="发送"
                variant="default"
                className="my-2.5 size-8 p-2 transition-opacity ease-in"
              >
                <SendHorizontalIcon />
              </TooltipIconButton>
            </ComposerPrimitive.Send>
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running>
            <ComposerPrimitive.Cancel asChild>
              <TooltipIconButton
                tooltip="停止"
                variant="default"
                className="my-2.5 size-8 p-2 transition-opacity ease-in"
              >
                <CircleStopIcon />
              </TooltipIconButton>
            </ComposerPrimitive.Cancel>
          </ThreadPrimitive.If>
        </div>
      </ComposerPrimitive.Root>
    </DragAndDropWrapper>
  );
};
