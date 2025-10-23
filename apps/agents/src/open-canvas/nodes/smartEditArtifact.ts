import {
  OpenCanvasGraphAnnotation,
  OpenCanvasGraphReturnType,
} from "../state.js";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  getArtifactContent,
  isArtifactMarkdownContent,
} from "@opencanvas/shared/utils/artifacts";
import { performSmartEdit } from "@opencanvas/shared/utils/editing";
import { analyzeEditType } from "./rewrite-artifact/utils.js";
import { createContextDocumentMessages } from "../../utils.js";
import { BaseMessage } from "@langchain/core/messages";

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

    // Get recent conversation history (last 5 messages before the current one)
    // This provides context for clarification dialogs
    const currentMessageIndex = state._messages.findIndex(
      (msg) => msg.id === recentHumanMessage.id
    );
    const conversationHistory =
      currentMessageIndex > 0
        ? state._messages.slice(Math.max(0, currentMessageIndex - 5), currentMessageIndex)
        : [];

    const editAnalysis = await analyzeEditType({
      artifactContent,
      recentHumanMessage,
      config,
      contextDocumentMessages: contextDocumentMessages as unknown as BaseMessage[],
      conversationHistory,
    });

    if (!editAnalysis?.edits || editAnalysis.edits.length === 0) {
      console.log(
        "[Smart Edit] No edits detected, routing to clarifyIntent"
      );
      console.log(`[Smart Edit] Reasoning: ${editAnalysis?.reasoning || "No reasoning provided"}`);

      // Route to clarifyIntent node to ask user for clarification
      return {
        smartEditAnalysisReasoning: editAnalysis?.reasoning || "The request was too vague to identify specific edits.",
        next: "clarifyIntent",
      };
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

  // Use smart matching to find the oldString with flexible matching strategies
  // This handles whitespace variations, indentation differences, and special characters
  const matchResult = performSmartEdit({
    content: artifactContent,
    oldString: currentEdit.oldString,
    newString: currentEdit.newString,
    expectedReplacements: 1,
  });

  if (!matchResult.success) {
    console.warn(
      `[Smart Edit] Could not locate edit target after trying all matching strategies`
    );
    console.warn(`[Smart Edit] Error: ${matchResult.error?.message}`);
    console.warn(`[Smart Edit] Looking for: ${currentEdit.oldString.substring(0, 100)}...`);

    // Route to clarifyIntent to ask user for more specific location
    return {
      smartEditAnalysisReasoning: `I found what you want to change, but couldn't locate it precisely in the document. ${matchResult.error?.message}. Could you provide more context about where this change should be made?`,
      next: "clarifyIntent",
    };
  }

  console.log(
    `[Smart Edit] Found edit target using ${matchResult.matchLevel} matching strategy`
  );

  // Find the position of oldString for code artifacts (markdown artifacts don't need this)
  const startCharIndex = artifactContent.indexOf(currentEdit.oldString);

  console.log(
    `[Smart Edit] Edit target position: ${startCharIndex !== -1 ? `${startCharIndex}-${startCharIndex + currentEdit.oldString.length}` : 'position will be determined by updateHighlightedText'}`
  );

  // Set appropriate highlighted field based on artifact type
  if (isArtifactMarkdownContent(currentArtifactContent)) {
    // Text artifact: set highlightedText and route to updateHighlightedText
    return {
      highlightedText: {
        fullMarkdown: artifactContent,
        markdownBlock: currentEdit.oldString,
        selectedText: currentEdit.oldString.replace(/[#*`\[\]]/g, "").trim(),
        replacementText: currentEdit.newString,
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
