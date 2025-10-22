import {
  UsaFlag,
  ChinaFlag,
  IndiaFlag,
  SpanishFlag,
  FrenchFlag,
} from "@/components/icons/flags";
import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { GraphInput } from "@opencanvas/shared/types";
import { LanguageOptions } from "@opencanvas/shared/types";

export interface TranslateOptionsProps {
  streamMessage: (params: GraphInput) => Promise<void>;
  handleClose: () => void;
}

export function TranslateOptions(props: TranslateOptionsProps) {
  const { streamMessage } = props;

  const handleSubmit = async (language: LanguageOptions) => {
    props.handleClose();
    await streamMessage({
      language,
    });
  };

  return (
    <div className="flex flex-col gap-3 items-center w-full">
      <TooltipIconButton
        tooltip="英语"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("english")}
      >
        <UsaFlag />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="中文"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("mandarin")}
      >
        <ChinaFlag />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="印地语"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("hindi")}
      >
        <IndiaFlag />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="西班牙语"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("spanish")}
      >
        <SpanishFlag />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="法语"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("french")}
      >
        <FrenchFlag />
      </TooltipIconButton>
    </div>
  );
}
