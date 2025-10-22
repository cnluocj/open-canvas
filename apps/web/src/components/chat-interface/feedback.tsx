import { useToast } from "@/hooks/use-toast";
import { FeedbackResponse } from "@/hooks/useFeedback";
import { ThumbsUpIcon, ThumbsDownIcon } from "lucide-react";
import { Dispatch, FC, SetStateAction } from "react";
import { cn } from "@/lib/utils";
import { TooltipIconButton } from "../ui/assistant-ui/tooltip-icon-button";

interface FeedbackButtonProps {
  runId: string;
  setFeedbackSubmitted: Dispatch<SetStateAction<boolean>>;
  sendFeedback: (
    runId: string,
    feedbackKey: string,
    score: number,
    comment?: string
  ) => Promise<FeedbackResponse | undefined>;
  feedbackValue: number;
  icon: "thumbs-up" | "thumbs-down";
  isLoading: boolean;
}

export const FeedbackButton: FC<FeedbackButtonProps> = ({
  runId,
  setFeedbackSubmitted,
  sendFeedback,
  isLoading,
  feedbackValue,
  icon,
}) => {
  const { toast } = useToast();

  const handleClick = async () => {
    try {
      const res = await sendFeedback(runId, "feedback", feedbackValue);
      if (res?.success) {
        setFeedbackSubmitted(true);
      } else {
        toast({
          title: "反馈提交失败",
          description: "请稍后再试。",
          variant: "destructive",
        });
      }
    } catch (_) {
      toast({
        title: "反馈提交失败",
        description: "请稍后再试。",
        variant: "destructive",
      });
    }
  };

  const tooltip =
    icon === "thumbs-up"
      ? "对本次运行给出正面反馈"
      : "对本次运行给出负面反馈";

  return (
    <TooltipIconButton
      variant="ghost"
      size="icon"
      onClick={handleClick}
      aria-label={tooltip}
      tooltip={tooltip}
      disabled={isLoading}
    >
      {icon === "thumbs-up" ? (
        <ThumbsUpIcon className={cn("size-4", isLoading && "text-gray-300")} />
      ) : (
        <ThumbsDownIcon
          className={cn("size-4", isLoading && "text-gray-300")}
        />
      )}
    </TooltipIconButton>
  );
};
