"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ActionBarPrimitive,
  getExternalStoreMessage,
  MessagePrimitive,
  MessageState,
  useMessage,
} from "@assistant-ui/react";
import React, { Dispatch, SetStateAction, useMemo, type FC } from "react";

import { MarkdownText } from "@/components/ui/assistant-ui/markdown-text";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FeedbackButton } from "./feedback";
import { TighterText } from "../ui/header";
import { useFeedback } from "@/hooks/useFeedback";
import { ContextDocumentsUI } from "../tool-hooks/AttachmentsToolUI";
import { HumanMessage } from "@langchain/core/messages";
import { OC_HIDE_FROM_UI_KEY } from "@opencanvas/shared/constants";
import { Button } from "../ui/button";
import { WEB_SEARCH_RESULTS_QUERY_PARAM, ARTIFACT_DIFF_QUERY_PARAM } from "@/constants";
import { Globe, FileText, Loader2, MessageCircle, Sparkles, PencilLine } from "lucide-react";
import { useQueryState } from "nuqs";

interface AssistantMessageProps {
  runId: string | undefined;
  feedbackSubmitted: boolean;
  setFeedbackSubmitted: Dispatch<SetStateAction<boolean>>;
}

const ThinkingAssistantMessageComponent = ({
  message,
}: {
  message: MessageState;
}): React.ReactElement => {
  const { id, content } = message;
  let contentText = "";
  if (typeof content === "string") {
    contentText = content;
  } else {
    const firstItem = content?.[0];
    if (firstItem?.type === "text") {
      contentText = firstItem.text;
    }
  }

  if (contentText === "") {
    return <></>;
  }

  return (
    <Accordion
      defaultValue={`accordion-${id}`}
      type="single"
      collapsible
      className="w-full"
    >
      <AccordionItem value={`accordion-${id}`}>
        <AccordionTrigger>思考过程</AccordionTrigger>
        <AccordionContent>{contentText}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

const ThinkingAssistantMessage = React.memo(ThinkingAssistantMessageComponent);

const WebSearchMessageComponent = ({ message }: { message: MessageState }) => {
  const [_, setShowWebResultsId] = useQueryState(
    WEB_SEARCH_RESULTS_QUERY_PARAM
  );

  const handleShowWebSearchResults = () => {
    if (!message.id) {
      return;
    }

    setShowWebResultsId(message.id);
  };

  return (
    <div className="flex mx-8">
      <Button
        onClick={handleShowWebSearchResults}
        variant="secondary"
        className="bg-blue-50 hover:bg-blue-100 transition-all ease-in-out duration-200 w-full"
      >
        <Globe className="size-4 mr-2" />
        网络搜索结果
      </Button>
    </div>
  );
};

const WebSearchMessage = React.memo(WebSearchMessageComponent);

const ArtifactDiffMessageComponent = ({ message }: { message: MessageState }) => {
  const [_, setShowDiffId] = useQueryState(ARTIFACT_DIFF_QUERY_PARAM);

  const handleShowDiff = () => {
    if (!message.id) {
      return;
    }

    setShowDiffId(message.id);
  };

  return (
    <div className="flex mx-8">
      <Button
        onClick={handleShowDiff}
        variant="secondary"
        className="bg-purple-50 hover:bg-purple-100 transition-all ease-in-out duration-200 w-full"
      >
        <FileText className="size-4 mr-2" />
        查看文档变更
      </Button>
    </div>
  );
};

const ArtifactDiffMessage = React.memo(ArtifactDiffMessageComponent);

type InstructionAction = "chat" | "generate" | "update";

type InstructionState =
  | {
      type: "pending";
    }
  | {
      type: "parsed";
      action: InstructionAction;
      reasoning?: string;
    };

const INSTRUCTION_ACTION_META: Record<
  InstructionAction,
  { label: string; description: string; Icon: typeof MessageCircle }
> = {
  chat: {
    label: "正在沟通需求",
    description: "助手正在向你确认生成报告所需的关键信息。",
    Icon: MessageCircle,
  },
  generate: {
    label: "正在生成报告",
    description: "助手正在根据已收集的信息生成病案报告。",
    Icon: Sparkles,
  },
  update: {
    label: "正在更新报告",
    description: "助手正在根据你的指示调整现有的病案报告内容。",
    Icon: PencilLine,
  },
};

const instructionStateCache = new Map<string, InstructionState>();

const parseInstruction = (maybeJson: string): InstructionState | { type: "none" } => {
  try {
    const parsed = JSON.parse(maybeJson) as {
      action?: string;
      reasoning?: unknown;
    };

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.action ||
      typeof parsed.action !== "string"
    ) {
      return { type: "none" };
    }

    if (
      parsed.action === "chat" ||
      parsed.action === "generate" ||
      parsed.action === "update"
    ) {
      return {
        type: "parsed",
        action: parsed.action,
        reasoning:
          typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
      };
    }

    return { type: "none" };
  } catch {
    return { type: "pending" };
  }
};

const extractInstructionPayload = (
  rawText: string,
): InstructionState | { type: "none" } => {
  const trimmedStart = rawText.trimStart();

  if (trimmedStart === "") return { type: "none" };

  if (trimmedStart.startsWith("{")) {
    return parseInstruction(trimmedStart);
  }

  if (!trimmedStart.startsWith("```")) {
    return { type: "none" };
  }

  // Support fenced code blocks, e.g. ```json\n{...}\n```
  const firstLineBreak = trimmedStart.indexOf("\n");
  if (firstLineBreak === -1) {
    // still streaming the language fence
    return { type: "pending" };
  }

  const fenceLanguage = trimmedStart.slice(3, firstLineBreak).trim().toLowerCase();
  if (fenceLanguage && fenceLanguage !== "json") {
    return { type: "none" };
  }

  const closingIndex = trimmedStart.lastIndexOf("```");
  if (closingIndex <= firstLineBreak) {
    // closing fence not yet received
    return { type: "pending" };
  }

  const jsonCandidate = trimmedStart
    .slice(firstLineBreak + 1, closingIndex)
    .trim();

  if (!jsonCandidate) {
    return { type: "pending" };
  }

  return parseInstruction(jsonCandidate);
};

const getInstructionState = (message: MessageState): InstructionState | null => {
  if (message.role !== "assistant") return null;

  const [firstPart] = message.content;
  if (!firstPart || firstPart.type !== "text") return null;

  const rawText = firstPart.text ?? "";
  const result = extractInstructionPayload(rawText);
  if (result.type === "none") {
    return instructionStateCache.get(message.id) ?? null;
  }

  instructionStateCache.set(message.id, result);
  return result;
};

const InstructionMessageComponent = ({
  instruction,
}: {
  instruction: InstructionState;
}) => {
  const message = useMessage();
  const { isLast } = message;

  const actionMeta =
    instruction.type === "parsed"
      ? INSTRUCTION_ACTION_META[instruction.action]
      : null;

  const ActionIcon = actionMeta?.Icon ?? MessageCircle;
  const isPending = instruction.type === "pending";

  // 判断状态：进行中 vs 已完成
  const isInProgress = isPending || (instruction.type === "parsed" && isLast);
  const isCompleted = instruction.type === "parsed" && !isLast;

  return (
    <>
      <style>{`
        @keyframes breathe {
          0%, 100% { background-color: rgb(255, 255, 255); }
          50% { background-color: rgb(156, 163, 175); }
        }
        .animate-breathe {
          animation: breathe 2s ease-in-out infinite;
        }
      `}</style>
      <MessagePrimitive.Root className="relative grid w-full max-w-2xl grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] py-4">
        <Avatar className="col-start-1 row-span-full row-start-1 mr-4">
          <AvatarFallback>A</AvatarFallback>
        </Avatar>

      <div className="col-span-2 col-start-2 row-start-1 my-1.5 max-w-xl break-words leading-7">
        <div className="rounded-2xl border border-dashed border-muted-foreground/40 bg-muted/40 px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            {isInProgress ? (
              // 进行中：白色到灰色呼吸圆点
              <div className="h-3 w-3 flex-shrink-0 rounded-full animate-breathe mt-2" />
            ) : isCompleted ? (
              // 已完成：绿色静态圆点
              <div className="h-3 w-3 flex-shrink-0 rounded-full bg-green-500 mt-2" />
            ) : (
              // 回退（不应该出现）
              <ActionIcon className="h-4 w-4 flex-shrink-0 mt-1.5" />
            )}
            <div className="flex flex-col gap-2 text-sm leading-6 text-muted-foreground">
              <div className="text-base font-medium text-foreground">
                {isPending
                  ? "助手正在解析指令…"
                  : actionMeta?.label ?? "助手正在处理指令"}
              </div>
              <div>
                {instruction.type === "parsed"
                  ? instruction.reasoning || actionMeta?.description
                  : "请稍候，助手正在根据指令准备回复。"}
              </div>
            </div>
          </div>
        </div>
      </div>
      </MessagePrimitive.Root>
    </>
  );
};

const InstructionMessage = React.memo(InstructionMessageComponent);

export const AssistantMessage: FC<AssistantMessageProps> = ({
  runId,
  feedbackSubmitted,
  setFeedbackSubmitted,
}) => {
  const message = useMessage();
  const { isLast } = message;
  const isThinkingMessage = message.id.startsWith("thinking-");
  const isWebSearchMessage = message.id.startsWith("web-search-results-");
  const isArtifactDiffMessage = message.id.startsWith("artifact-diff-");
  const instructionState = useMemo(
    () => getInstructionState(message),
    [message],
  );

  if (isThinkingMessage) {
    return <ThinkingAssistantMessage message={message} />;
  }

  if (isWebSearchMessage) {
    return <WebSearchMessage message={message} />;
  }

  if (isArtifactDiffMessage) {
    return <ArtifactDiffMessage message={message} />;
  }

  if (instructionState) {
    return <InstructionMessage instruction={instructionState} />;
  }

  return (
    <MessagePrimitive.Root className="relative grid w-full max-w-2xl grid-cols-[auto_auto_1fr] grid-rows-[auto_1fr] py-4">
      <Avatar className="col-start-1 row-span-full row-start-1 mr-4">
        <AvatarFallback>A</AvatarFallback>
      </Avatar>

      <div className="text-foreground col-span-2 col-start-2 row-start-1 my-1.5 max-w-xl break-words leading-7">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
        {isLast && runId && (
          <MessagePrimitive.If lastOrHover assistant>
            <AssistantMessageBar
              feedbackSubmitted={feedbackSubmitted}
              setFeedbackSubmitted={setFeedbackSubmitted}
              runId={runId}
            />
          </MessagePrimitive.If>
        )}
      </div>
    </MessagePrimitive.Root>
  );
};

export const UserMessage: FC = () => {
  const msg = useMessage(getExternalStoreMessage<HumanMessage>);
  const humanMessage = Array.isArray(msg) ? msg[0] : msg;

  if (humanMessage?.additional_kwargs?.[OC_HIDE_FROM_UI_KEY]) return null;

  return (
    <MessagePrimitive.Root className="grid w-full max-w-2xl auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] gap-y-2 py-4">
      <ContextDocumentsUI
        message={humanMessage}
        className="col-start-2 row-start-1"
      />
      <div className="bg-muted text-foreground col-start-2 row-start-2 max-w-xl break-words rounded-3xl px-5 py-2.5">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
};

interface AssistantMessageBarProps {
  runId: string;
  feedbackSubmitted: boolean;
  setFeedbackSubmitted: Dispatch<SetStateAction<boolean>>;
}

const AssistantMessageBarComponent = ({
  runId,
  feedbackSubmitted,
  setFeedbackSubmitted,
}: AssistantMessageBarProps) => {
  const { isLoading, sendFeedback } = useFeedback();
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="flex items-center mt-2"
    >
      {feedbackSubmitted ? (
        <TighterText className="text-gray-500 text-sm">
          已收到反馈，感谢支持！
        </TighterText>
      ) : (
        <>
          <ActionBarPrimitive.FeedbackPositive asChild>
            <FeedbackButton
              isLoading={isLoading}
              sendFeedback={sendFeedback}
              setFeedbackSubmitted={setFeedbackSubmitted}
              runId={runId}
              feedbackValue={1.0}
              icon="thumbs-up"
            />
          </ActionBarPrimitive.FeedbackPositive>
          <ActionBarPrimitive.FeedbackNegative asChild>
            <FeedbackButton
              isLoading={isLoading}
              sendFeedback={sendFeedback}
              setFeedbackSubmitted={setFeedbackSubmitted}
              runId={runId}
              feedbackValue={0.0}
              icon="thumbs-down"
            />
          </ActionBarPrimitive.FeedbackNegative>
        </>
      )}
    </ActionBarPrimitive.Root>
  );
};

const AssistantMessageBar = React.memo(AssistantMessageBarComponent);
