import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

export const exportToWord = async (content: string) => {
  const lines = content.split("\n");
  const children: Paragraph[] = [];
  let docTitle = "Document";
  let disableIndentation = false;
  let titleFound = false;
  let firstHeadingFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      continue;
    }

    // Check for References section to disable indentation
    if (line.includes("参考文献") || line.includes("References")) {
      disableIndentation = true;
    }

    // Title (First line starting with #)
    if (line.startsWith("# ")) {
      titleFound = true;
      const titleText = line.replace("# ", "");
      docTitle = titleText; // Set document title for filename
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 400,
          },
          children: [
            new TextRun({
              text: titleText,
              font: "SimSun",
              size: 28, // 14pt = 28 half-points
              bold: true,
              color: "000000",
            }),
          ],
        })
      );
    }
    // Heading 2
    else if (line.startsWith("## ")) {
      firstHeadingFound = true;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1, // Map ## to Heading 1 in Word for structure
          spacing: {
            before: 240,
            after: 120,
          },
          children: [
            new TextRun({
              text: line.replace("## ", ""),
              font: "SimSun",
              size: 21, // 10.5pt = 21 half-points
              bold: true,
              color: "000000",
            }),
          ],
        })
      );
    }
    // Heading 3
    else if (line.startsWith("### ")) {
      firstHeadingFound = true;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: {
            before: 240,
            after: 120,
          },
          children: [
            new TextRun({
              text: line.replace("### ", ""),
              font: "SimSun",
              size: 21, // 10.5pt = 21 half-points
              bold: true,
              color: "000000",
            }),
          ],
        })
      );
    }
    // Heading 4
    else if (line.startsWith("#### ")) {
      firstHeadingFound = true;
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          spacing: {
            before: 240,
            after: 120,
          },
          children: [
            new TextRun({
              text: line.replace("#### ", ""),
              font: "SimSun",
              size: 21, // 10.5pt = 21 half-points
              bold: true,
              color: "000000",
            }),
          ],
        })
      );
    }
    // List items
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.replace(/^[-*] /, ""),
              font: "SimSun",
              size: 21, // 10.5pt
              color: "000000",
            }),
          ],
          bullet: {
            level: 0,
          },
        })
      );
    }
    // Normal paragraph
    else {
      let alignment: AlignmentType = AlignmentType.LEFT;
      let indent: any = { firstLine: 420 }; // ~2 chars at 10.5pt

      // Author Info: Content between Title and First Heading
      if (titleFound && !firstHeadingFound) {
        alignment = AlignmentType.CENTER;
        indent = undefined;
      } else if (disableIndentation) {
        indent = undefined;
      }

      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              font: "SimSun",
              size: 21, // 10.5pt
              color: "000000",
            }),
          ],
          alignment: alignment,
          indent: indent,
          spacing: {
            after: 120,
          },
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${docTitle.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.docx`);
};
