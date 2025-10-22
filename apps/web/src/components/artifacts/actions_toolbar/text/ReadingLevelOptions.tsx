import {
  Baby,
  GraduationCap,
  PersonStanding,
  School,
  Swords,
} from "lucide-react";
import { ReadingLevelOptions as ReadingLevelOptionsType } from "@opencanvas/shared/types";
import { TooltipIconButton } from "@/components/ui/assistant-ui/tooltip-icon-button";
import { GraphInput } from "@opencanvas/shared/types";

export interface ReadingLevelOptionsProps {
  streamMessage: (params: GraphInput) => Promise<void>;
  handleClose: () => void;
}

export function ReadingLevelOptions(props: ReadingLevelOptionsProps) {
  const { streamMessage } = props;

  const handleSubmit = async (readingLevel: ReadingLevelOptionsType) => {
    props.handleClose();
    await streamMessage({
      readingLevel,
    });
  };

  return (
    <div className="flex flex-col gap-3 items-center w-full">
      <TooltipIconButton
        tooltip="博士"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("phd")}
      >
        <GraduationCap />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="大学"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("college")}
      >
        <School />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="青少年"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("teenager")}
      >
        <PersonStanding />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="儿童"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("child")}
      >
        <Baby />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="海盗"
        variant="ghost"
        className="transition-colors w-[36px] h-[36px]"
        delayDuration={400}
        onClick={async () => await handleSubmit("pirate")}
      >
        <Swords />
      </TooltipIconButton>
    </div>
  );
}
