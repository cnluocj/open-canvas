import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eye, EyeOff } from "lucide-react";
import {
  Dispatch,
  FormEvent,
  SetStateAction,
  useEffect,
  useState,
} from "react";
import { FullPrompt } from "./FullPrompt";
import { InlineContextTooltip } from "@/components/ui/inline-context-tooltip";
import { useStore } from "@/hooks/useStore";
import { useToast } from "@/hooks/use-toast";
import { v4 as uuidv4 } from "uuid";
import { CustomQuickAction } from "@opencanvas/shared/types";
import { TighterText } from "@/components/ui/header";
import { User } from "@supabase/supabase-js";

const CUSTOM_INSTRUCTIONS_TOOLTIP_TEXT = `此处填写你自定义的指令，系统会根据它们指导 LLM 重新生成选中的作品。`;
const FULL_PROMPT_TOOLTIP_TEXT = `这是调用快捷操作时发送给 LLM 的完整提示词，包含你的自定义指令及默认上下文。`;

interface NewCustomQuickActionDialogProps {
  user: User | undefined;
  isEditing: boolean;
  allQuickActions: CustomQuickAction[];
  customQuickAction?: CustomQuickAction;
  getAndSetCustomQuickActions: (userId: string) => Promise<void>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ViewOrHidePromptIconProps {
  showFullPrompt: boolean;
  setShowFullPrompt: Dispatch<SetStateAction<boolean>>;
}

const ViewOrHidePromptIcon = (props: ViewOrHidePromptIconProps) => (
  <TooltipIconButton
    tooltip={props.showFullPrompt ? "隐藏完整提示" : "查看完整提示"}
    variant="ghost"
    className="transition-colors"
    delayDuration={400}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      props.setShowFullPrompt((p) => !p);
    }}
  >
    {props.showFullPrompt ? (
      <EyeOff className="w-4 h-4 text-gray-600" />
    ) : (
      <Eye className="w-4 h-4 text-gray-600" />
    )}
  </TooltipIconButton>
);

export function NewCustomQuickActionDialog(
  props: NewCustomQuickActionDialogProps
) {
  const { toast } = useToast();
  const { user } = props;
  const { createCustomQuickAction, editCustomQuickAction } = useStore();
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [includeReflections, setIncludeReflections] = useState(true);
  const [includePrefix, setIncludePrefix] = useState(true);
  const [includeRecentHistory, setIncludeRecentHistory] = useState(true);
  const [showFullPrompt, setShowFullPrompt] = useState(true);

  useEffect(() => {
    if (props.customQuickAction) {
      setName(props.customQuickAction.title || "");
      setPrompt(props.customQuickAction.prompt || "");
      setIncludeReflections(props.customQuickAction.includeReflections ?? true);
      setIncludePrefix(props.customQuickAction.includePrefix ?? true);
      setIncludeRecentHistory(
        props.customQuickAction.includeRecentHistory ?? true
      );
    }
  }, [props.customQuickAction]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: "未找到用户",
        variant: "destructive",
        duration: 5000,
      });
      return;
    }
    setIsSubmitLoading(true);

    try {
      let success = false;
      if (props.isEditing && props.customQuickAction) {
        success = await editCustomQuickAction(
          {
            id: props.customQuickAction.id,
            title: name,
            prompt,
            includePrefix,
            includeRecentHistory,
            includeReflections,
          },
          props.allQuickActions,
          user.id
        );
      } else {
        success = await createCustomQuickAction(
          {
            id: uuidv4(),
            title: name,
            prompt,
            includePrefix,
            includeRecentHistory,
            includeReflections,
          },
          props.allQuickActions,
          user.id
        );
      }

      if (success) {
        toast({
          title: `自定义快捷操作${props.isEditing ? "更新" : "创建"}成功`,
        });
        handleClearState();
        props.onOpenChange(false);
        // Re-fetch after creating a new custom quick action to update the list
        await props.getAndSetCustomQuickActions(user.id);
      } else {
        toast({
          title: `自定义快捷操作${props.isEditing ? "更新" : "创建"}失败`,
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleClearState = () => {
    setName("");
    setPrompt("");
    setIncludeReflections(true);
    setIncludePrefix(true);
    setIncludeRecentHistory(true);
    setShowFullPrompt(true);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(change) => {
        if (!change) {
          handleClearState();
        }
        props.onOpenChange(change);
      }}
    >
      <DialogContent className="max-w-xl p-8 bg-white rounded-lg shadow-xl min-w-[70vw]">
        <DialogHeader>
          <DialogTitle className="text-3xl font-light text-gray-800">
            <TighterText>
              {props.isEditing ? "编辑" : "创建"}快捷操作
            </TighterText>
          </DialogTitle>
          <DialogDescription className="mt-2 text-md font-light text-gray-600">
            <TighterText>
              自定义快捷操作可以让你为选中的作品配置专属的处理流程。
            </TighterText>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col items-start justify-start gap-4 w-full"
        >
          <Label htmlFor="name">
            <TighterText>
              名称 <span className="text-red-500">*</span>
            </TighterText>
          </Label>
          <Input
            disabled={isSubmitLoading}
            required
            id="name"
            placeholder="例如：检查拼写错误"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex flex-col gap-1 w-full">
            <Label
              htmlFor="prompt"
              className="flex items-center justify-between w-full"
            >
              <TighterText>
                提示词 <span className="text-red-500 mr-2">*</span>
              </TighterText>
              <ViewOrHidePromptIcon
                showFullPrompt={showFullPrompt}
                setShowFullPrompt={setShowFullPrompt}
              />
            </Label>
            <TighterText className="text-gray-500 text-sm whitespace-normal">
              完整提示词包含用花括号包裹的预置变量
              （例如 <code className="inline-code">{`{artifactContent}`}</code>），
              会在运行时自动替换。暂不支持自定义变量。
            </TighterText>
            <span className="my-1" />
            <div className="flex items-center justify-center w-full h-[350px] gap-2 transition-all duration-300 ease-in-out">
              <div className="w-full h-full flex flex-col gap-1">
                <TighterText className="text-gray-500 text-sm flex items-center">
                  自定义指令
                  <InlineContextTooltip>
                    <p className="text-sm text-gray-600">
                      {CUSTOM_INSTRUCTIONS_TOOLTIP_TEXT}
                    </p>
                  </InlineContextTooltip>
                </TighterText>
                <Textarea
                  disabled={isSubmitLoading}
                  required
                  id="prompt"
                  placeholder="针对以下文本..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full h-full resize-none"
                />
              </div>

              {showFullPrompt && (
                <div className="w-full h-full flex flex-col gap-1">
                  <TighterText className="text-gray-500 text-sm flex items-center">
                    完整提示词
                    <InlineContextTooltip>
                      <p className="text-sm text-gray-600">
                        {FULL_PROMPT_TOOLTIP_TEXT}
                      </p>
                    </InlineContextTooltip>
                  </TighterText>
                  <FullPrompt
                    customQuickAction={{
                      title: name,
                      prompt,
                      includePrefix,
                      includeReflections,
                      includeRecentHistory,
                    }}
                    setIncludePrefix={setIncludePrefix}
                    setIncludeRecentHistory={setIncludeRecentHistory}
                    setIncludeReflections={setIncludeReflections}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              disabled={isSubmitLoading}
              checked={includePrefix}
              onCheckedChange={(c) => setIncludePrefix(!!c)}
              id="includeReflections"
            />
            <label
              htmlFor="includeReflections"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              <TighterText>在提示词中包含前缀</TighterText>
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              disabled={isSubmitLoading}
              checked={includeReflections}
              onCheckedChange={(c) => setIncludeReflections(!!c)}
              id="includeReflections"
            />
            <label
              htmlFor="includeReflections"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              <TighterText>在提示词中包含反思内容</TighterText>
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              disabled={isSubmitLoading}
              checked={includeRecentHistory}
              onCheckedChange={(c) => setIncludeRecentHistory(!!c)}
              id="includeReflections"
            />
            <label
              htmlFor="includeReflections"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              <TighterText>在提示词中包含最近历史</TighterText>
            </label>
          </div>
          <div className="flex items-center justify-center w-full mt-4 gap-3">
            <Button disabled={isSubmitLoading} className="w-full" type="submit">
              <TighterText>保存</TighterText>
            </Button>
            <Button
              disabled={isSubmitLoading}
              onClick={() => {
                handleClearState();
                props.onOpenChange(false);
              }}
              variant="destructive"
              className="w-[20%]"
              type="button"
            >
              <TighterText>取消</TighterText>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
