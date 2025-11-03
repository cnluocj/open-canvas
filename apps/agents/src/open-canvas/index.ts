import { END, Send, START, StateGraph } from "@langchain/langgraph";
import { DEFAULT_INPUTS } from "@opencanvas/shared/constants";
import { mainAgent } from "./nodes/mainAgent.js";
import { generateArtifact } from "./nodes/generate-artifact/index.js";
import { generateFollowup } from "./nodes/generateFollowup.js";
import { rewriteArtifact } from "./nodes/rewrite-artifact/index.js";
import { smartEditArtifact } from "./nodes/smartEditArtifact.js";
import { updateHighlightedText } from "./nodes/updateHighlightedText.js";
import { updateArtifact } from "./nodes/updateArtifact.js";
import { clarifyIntent } from "./nodes/clarifyIntent.js";
import { generateTitleNode } from "./nodes/generateTitle.js";
import { OpenCanvasGraphAnnotation } from "./state.js";
import { summarizer } from "./nodes/summarizer.js";
import { processMaterial } from "./nodes/processMaterial.js";

const routeNode = (state: typeof OpenCanvasGraphAnnotation.State) => {
  if (!state.next) {
    // 如果没有设置 next，说明是 chat 情况，直接到 cleanState
    return new Send("cleanState", {
      ...state,
    });
  }

  return new Send(state.next, {
    ...state,
  });
};

/**
 * Route after smartEditArtifact analysis.
 * Handles routing to updateHighlightedText, updateArtifact, clarifyIntent, or rewriteArtifact.
 */
const routeSmartEdit = (state: typeof OpenCanvasGraphAnnotation.State) => {
  if (!state.next) {
    throw new Error("smartEditArtifact must set 'next' field");
  }
  return new Send(state.next, {
    ...state,
  });
};

/**
 * After updating, check if there are remaining edits to process.
 * If yes, loop back to smartEditArtifact. Otherwise, go to generateFollowup.
 */
const routeAfterUpdate = (state: typeof OpenCanvasGraphAnnotation.State): "smartEditArtifact" | "generateFollowup" => {
  if (state.remainingSmartEdits && state.remainingSmartEdits.length > 0) {
    return "smartEditArtifact";
  }
  return "generateFollowup";
};

const cleanState = (_: typeof OpenCanvasGraphAnnotation.State) => {
  return {
    ...DEFAULT_INPUTS,
  };
};

// ~ 4 chars per token, max tokens of 75000. 75000 * 4 = 300000
const CHARACTER_MAX = 300000;

function simpleTokenCalculator(
  state: typeof OpenCanvasGraphAnnotation.State
): "summarizer" | typeof END {
  const totalChars = state._messages.reduce((acc, msg) => {
    if (typeof msg.content !== "string") {
      const allContent = msg.content.flatMap((c) =>
        "text" in c ? (c.text as string) : []
      );
      const totalChars = allContent.reduce((acc, c) => acc + c.length, 0);
      return acc + totalChars;
    }
    return acc + msg.content.length;
  }, 0);

  if (totalChars > CHARACTER_MAX) {
    return "summarizer";
  }
  return END;
}

/**
 * Conditionally route to the "generateTitle" node if there are only
 * two messages in the conversation. This node generates a concise title
 * for the conversation which is displayed in the thread history.
 */
const conditionallyGenerateTitle = (
  state: typeof OpenCanvasGraphAnnotation.State
): "generateTitle" | "summarizer" | typeof END => {
  if (state.messages.length > 2) {
    // Do not generate if there are more than two messages (meaning it's not the first human-AI conversation)
    return simpleTokenCalculator(state);
  }
  return "generateTitle";
};

const builder = new StateGraph(OpenCanvasGraphAnnotation)
  // Start node & edge
  .addNode("mainAgent", mainAgent)
  .addEdge(START, "mainAgent")
  // Core nodes
  .addNode("generateArtifact", generateArtifact)
  .addNode("rewriteArtifact", rewriteArtifact)
  .addNode("smartEditArtifact", smartEditArtifact)
  .addNode("updateHighlightedText", updateHighlightedText)
  .addNode("updateArtifact", updateArtifact)
  .addNode("clarifyIntent", clarifyIntent)
  .addNode("generateFollowup", generateFollowup)
  .addNode("cleanState", cleanState)
  .addNode("generateTitle", generateTitleNode)
  .addNode("summarizer", summarizer)
  // Material processing node (for medical case documents)
  .addNode("processMaterial", processMaterial)
  // mainAgent routing:
  //   chat → cleanState
  //   generate → generateArtifact
  //   update (with selection) → updateHighlightedText/updateArtifact (fast path)
  //   update (no selection) → smartEditArtifact (analysis needed)
  //   material processing → processMaterial (via process_material tool)
  //   loop back → mainAgent (after set_report_type, to check for next steps)
  .addConditionalEdges("mainAgent", routeNode, [
    "generateArtifact",
    "smartEditArtifact",
    "updateHighlightedText",
    "updateArtifact",
    "cleanState",
    "processMaterial",
    "mainAgent",
  ])
  // smartEditArtifact routing: analyze and route to appropriate handler
  .addConditionalEdges("smartEditArtifact", routeSmartEdit, [
    "updateHighlightedText",
    "updateArtifact",
    "clarifyIntent",
    "rewriteArtifact",
  ])
  // After updating, check for remaining edits (loop back if needed)
  .addConditionalEdges("updateHighlightedText", routeAfterUpdate, [
    "smartEditArtifact",
    "generateFollowup",
  ])
  .addConditionalEdges("updateArtifact", routeAfterUpdate, [
    "smartEditArtifact",
    "generateFollowup",
  ])
  // clarifyIntent returns a chat message, go to cleanState
  .addEdge("clarifyIntent", "cleanState")
  // After generation/rewrite, go to followup
  .addEdge("generateArtifact", "generateFollowup")
  .addEdge("rewriteArtifact", "generateFollowup")
  .addEdge("generateFollowup", "cleanState")
  // Material processing flow: processMaterial routes back to mainAgent
  .addConditionalEdges("processMaterial", routeNode, ["mainAgent"])
  // After clean state, conditionally generate title or summarize
  .addConditionalEdges("cleanState", conditionallyGenerateTitle, [
    END,
    "generateTitle",
    "summarizer",
  ])
  .addEdge("generateTitle", END)
  .addEdge("summarizer", END);

export const graph = builder.compile().withConfig({ runName: "open_canvas" });
