import { ProgrammingLanguageOptions } from "@opencanvas/shared/types";
import { ThreadPrimitive, useThreadRuntime } from "@assistant-ui/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FC, useMemo } from "react";
import { TighterText } from "../ui/header";
import { NotebookPen } from "lucide-react";
import { ProgrammingLanguagesDropdown } from "../ui/programming-lang-dropdown";
import { Button } from "../ui/button";

const QUICK_START_PROMPTS_SEARCH = [
  "检索罕见心肌炎病例并整理诊疗要点",
  "汇总胆结石 ERCP 术后并发症病例",
  "查找儿童川崎病病例随访数据",
  "收集胰腺假性囊肿介入治疗案例",
  "整理多发性骨髓瘤最新病例系列",
  "调研妊娠期甲状腺危象病例报道",
  "汇总脑动脉瘤夹闭术后复发病例",
  "检索肺部孤立结节的病理诊断案例",
  "查找免疫检查点抑制剂相关肝炎病例",
  "收集房颤合并卒中抗凝治疗病例",
];

const QUICK_START_PROMPTS = [
  "撰写急性胰腺炎病例报告摘要",
  "记录术后感染病例的诊疗过程",
  "整理罕见肿瘤病例的影像特征",
  "总结重症肺炎患者的治疗路径",
  "描述儿科癫痫病例的用药调整",
  "概述心衰合并肾损伤病程记录",
  "撰写妊娠糖尿病病例随访纪要",
  "总结卒中再通治疗的病例要点",
  "记录多器官功能衰竭的救治经过",
  "整理移植排斥反应的诊断流程",
  "撰写糖尿病足病例的护理总结",
  "总结罕见药物不良反应病例",
  "记录高血压危象的救治细节",
  "整理骨折延迟愈合病例观察",
];

function getRandomPrompts(prompts: string[], count: number = 4): string[] {
  return [...prompts].sort(() => Math.random() - 0.5).slice(0, count);
}

interface QuickStartButtonsProps {
  handleQuickStart: (
    type: "text" | "code",
    language?: ProgrammingLanguageOptions
  ) => void;
  composer: React.ReactNode;
  searchEnabled: boolean;
}

interface QuickStartPromptsProps {
  searchEnabled: boolean;
}

const QuickStartPrompts = ({ searchEnabled }: QuickStartPromptsProps) => {
  const threadRuntime = useThreadRuntime();

  const handleClick = (text: string) => {
    threadRuntime.append({
      role: "user",
      content: [{ type: "text", text }],
    });
  };

  const selectedPrompts = useMemo(
    () =>
      getRandomPrompts(
        searchEnabled ? QUICK_START_PROMPTS_SEARCH : QUICK_START_PROMPTS
      ),
    [searchEnabled]
  );

  return (
    <div className="flex flex-col w-full gap-2">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
        {selectedPrompts.map((prompt, index) => (
          <Button
            key={`quick-start-prompt-${index}`}
            onClick={() => handleClick(prompt)}
            variant="outline"
            className="min-h-[60px] w-full flex items-center justify-center p-6 whitespace-normal text-gray-500 hover:text-gray-700 transition-colors ease-in rounded-2xl"
          >
            <p className="text-center break-words text-sm font-normal">
              {prompt}
            </p>
          </Button>
        ))}
      </div>
    </div>
  );
};

const QuickStartButtons = (props: QuickStartButtonsProps) => {
  const handleLanguageSubmit = (language: ProgrammingLanguageOptions) => {
    props.handleQuickStart("code", language);
  };

  return (
    <div className="flex flex-col gap-8 items-center justify-center w-full">
      <div className="flex flex-col gap-6">
        <p className="text-gray-600 text-sm">从空白画布开始</p>
        <div className="flex flex-row gap-1 items-center justify-center w-full">
          <Button
            variant="outline"
            className="text-gray-500 hover:text-gray-700 transition-colors ease-in rounded-2xl flex items-center justify-center gap-2 w-[250px] h-[64px]"
            onClick={() => props.handleQuickStart("text")}
          >
            新建 Markdown
            <NotebookPen />
          </Button>
          <ProgrammingLanguagesDropdown handleSubmit={handleLanguageSubmit} />
        </div>
      </div>
      <div className="flex flex-col gap-6 mt-2 w-full">
        <p className="text-gray-600 text-sm">或从一条消息开始</p>
        {props.composer}
        <QuickStartPrompts searchEnabled={props.searchEnabled} />
      </div>
    </div>
  );
};

interface ThreadWelcomeProps {
  handleQuickStart: (
    type: "text" | "code",
    language?: ProgrammingLanguageOptions
  ) => void;
  composer: React.ReactNode;
  searchEnabled: boolean;
}

export const ThreadWelcome: FC<ThreadWelcomeProps> = (
  props: ThreadWelcomeProps
) => {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex items-center justify-center mt-16 w-full">
        <div className="text-center max-w-3xl w-full">
          <Avatar className="mx-auto">
            <AvatarImage src="/lc_logo.jpg" alt="LangChain 徽标" />
            <AvatarFallback>LC</AvatarFallback>
          </Avatar>
          <TighterText className="mt-4 text-lg font-medium">
            今天想写点什么？
          </TighterText>
          <div className="mt-8 w-full">
            <QuickStartButtons
              composer={props.composer}
              handleQuickStart={props.handleQuickStart}
              searchEnabled={props.searchEnabled}
            />
          </div>
        </div>
      </div>
    </ThreadPrimitive.Empty>
  );
};
