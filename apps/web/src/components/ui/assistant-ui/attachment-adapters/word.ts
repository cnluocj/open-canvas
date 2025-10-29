import {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
} from "@assistant-ui/react";

export class WordAttachmentAdapter implements AttachmentAdapter {
  public accept =
    "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx";

  public async add(state: { file: File }): Promise<PendingAttachment> {
    return {
      id: state.file.name,
      type: "document",
      name: state.file.name,
      contentType: state.file.type,
      file: state.file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  public async send(
    attachment: PendingAttachment
  ): Promise<CompleteAttachment> {
    return {
      ...attachment,
      status: { type: "complete" },
      content: [],
    };
  }

  public async remove() {
    // noop
  }
}
