import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";
import { analyzeEditType } from "./rewrite-artifact/utils.js";
import { createContextDocumentMessages } from "../../utils.js";
import { BaseMessage } from "@langchain/core/messages";
import { rewriteArtifact } from "./rewrite-artifact/index.js";

/**
 * Smart Edit node: Analyzes user requests and applies targeted edits to specific
 * parts of the artifact. Supports multiple edits processed sequentially with streaming output.
 *
 * Flow:
 * 1. First call: Analyzes the request and extracts targeted edits
 * 2. Processes the first edit by setting highlightedText/Code
 * 3. Routes to updateHighlightedText or updateArtifact for streaming output
 * 4. After update completes, checks for remaining edits and loops back if needed
 */
export const smartEditArtifact = async (
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<OpenCanvasGraphReturnType> => {
  const currentArtifactContent = getArtifactContent(state.artifact);
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }

  const artifactContent = isArtifactMarkdownContent(currentArtifactContent)
    ? currentArtifactContent.fullMarkdown
    : currentArtifactContent.code;

  let editsToProcess = state.remainingSmartEdits;

  // If no remaining edits, this is the first call - analyze the request
  if (!editsToProcess || editsToProcess.length === 0) {
    const recentHumanMessage = state._messages.findLast(
      (msg) => msg.getType() === "human"
    );
    if (!recentHumanMessage) {
      throw new Error("No recent human message found");
    }

    console.log("[Smart Edit] Analyzing edit request...");
    const contextDocumentMessages = await createContextDocumentMessages(config);
    const editAnalysis = await analyzeEditType({
      artifactContent,
      recentHumanMessage,
      config,
      contextDocumentMessages: contextDocumentMessages as unknown as BaseMessage[],
    });

    if (!editAnalysis?.edits || editAnalysis.edits.length === 0) {
      console.log(
        "[Smart Edit] No edits detected, falling back to full rewrite"
      );
      return rewriteArtifact(state, config);
    }

    editsToProcess = editAnalysis.edits;
    console.log(
      `[Smart Edit] Detected ${editsToProcess.length} edit(s): ${editAnalysis.reasoning}`
    );
  } else {
    console.log(
      `[Smart Edit] Continuing with ${editsToProcess.length} remaining edit(s)`
    );
  }

  // Process the first edit
  const currentEdit = editsToProcess[0];
  const remainingEdits = editsToProcess.slice(1);

  console.log(`[Smart Edit] Processing edit: ${currentEdit.explanation}`);

  // Find the position of oldString in the current artifact
  const startCharIndex = artifactContent.indexOf(currentEdit.oldString);
  if (startCharIndex === -1) {
    console.warn(
      `[Smart Edit] Could not locate edit target, falling back to full rewrite`
    );
    console.warn(`[Smart Edit] Looking for: ${currentEdit.oldString.substring(0, 100)}...`);
    return rewriteArtifact(state, config);
  }

  console.log(
    `[Smart Edit] Found edit target at position ${startCharIndex}-${startCharIndex + currentEdit.oldString.length}`
  );

  // Set appropriate highlighted field based on artifact type
  if (isArtifactMarkdownContent(currentArtifactContent)) {
    // Text artifact: set highlightedText and route to updateHighlightedText
    return {
      highlightedText: {
        fullMarkdown: artifactContent,
        markdownBlock: currentEdit.oldString,
        selectedText: currentEdit.oldString.replace(/[#*`\[\]]/g, "").trim(),
      },
      remainingSmartEdits:
        remainingEdits.length > 0 ? remainingEdits : undefined,
      next: "updateHighlightedText",
    };
  } else {
    // Code artifact: set highlightedCode and route to updateArtifact
    return {
      highlightedCode: {
        startCharIndex,
        endCharIndex: startCharIndex + currentEdit.oldString.length,
      },
      remainingSmartEdits:
        remainingEdits.length > 0 ? remainingEdits : undefined,
      next: "updateArtifact",
    };
  }
};
