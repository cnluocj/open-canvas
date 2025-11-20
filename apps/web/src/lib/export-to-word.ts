import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

export const exportToWord = async (content: string, title: string) => {
  const lines = content.split("\n");
  const children: (Paragraph)[] = [];

  // Add Title
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 400,
      },
    })
  );

  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      // Empty line, maybe add some spacing or ignore
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          text: line.replace("# ", ""),
          heading: HeadingLevel.HEADING_1,
          spacing: {
            before: 240,
            after: 120,
          },
        })
      );
      inList = false;
    } else if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: line.replace("## ", ""),
          heading: HeadingLevel.HEADING_2,
          spacing: {
            before: 240,
            after: 120,
          },
        })
      );
      inList = false;
    } else if (line.startsWith("### ")) {
      children.push(
        new Paragraph({
          text: line.replace("### ", ""),
          heading: HeadingLevel.HEADING_3,
          spacing: {
            before: 240,
            after: 120,
          },
        })
      );
      inList = false;
    } 
    // List items
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      children.push(
        new Paragraph({
          text: line.replace(/^[-*] /, ""),
          bullet: {
            level: 0,
          },
        })
      );
      inList = true;
    }
    // Normal paragraph
    else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
            }),
          ],
          spacing: {
            after: 120,
          },
        })
      );
      inList = false;
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
  saveAs(blob, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`);
};
