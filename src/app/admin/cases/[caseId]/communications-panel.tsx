import type {
  listCaseCorrespondence,
  listCaseCorrespondenceAttachments,
  listCaseNoteAttachments,
  listCaseNotes,
  listCommunicationTemplates,
} from "@/modules/communications/repository";
import type { listCaseDocuments } from "@/modules/documents/repository";
import {
  createCaseNoteAction,
  createOutboundCorrespondenceAction,
  queueCorrespondenceAction,
  recordCorrespondenceSentAction,
  recordInboundCorrespondenceAction,
} from "./actions";

type Notes = Awaited<ReturnType<typeof listCaseNotes>>;
type NoteAttachments = Awaited<
  ReturnType<typeof listCaseNoteAttachments>
>;
type Correspondence = Awaited<
  ReturnType<typeof listCaseCorrespondence>
>;
type CorrespondenceAttachments = Awaited<
  ReturnType<typeof listCaseCorrespondenceAttachments>
>;
type Templates = Awaited<
  ReturnType<typeof listCommunicationTemplates>
>;
type CaseDocuments = Awaited<
  ReturnType<typeof listCaseDocuments>
>;

export function CaseCommunicationsPanel({
  caseId,
  notes,
  noteAttachments,
  correspondence,
  correspondenceAttachments,
  templates,
  caseDocuments,
  canViewNotes,
  canViewCorrespondence,
  canCreateInternalNote,
  canCreateParticipantNote,
  canManageCorrespondence,
}: {
  caseId: string;
  notes: Notes;
  noteAttachments: NoteAttachments;
  correspondence: Correspondence;
  correspondenceAttachments: CorrespondenceAttachments;
  templates: Templates;
  caseDocuments: CaseDocuments;
  canViewNotes: boolean;
  canViewCorrespondence: boolean;
  canCreateInternalNote: boolean;
  canCreateParticipantNote: boolean;
  canManageCorrespondence: boolean;
}) {
  const noteAttachmentMap = new Map<string, NoteAttachments>();
  for (const attachment of noteAttachments) {
    const current = noteAttachmentMap.get(attachment.noteId) ?? [];
    current.push(attachment);
    noteAttachmentMap.set(attachment.noteId, current);
  }

  const messageAttachmentMap = new Map<
    string,
    CorrespondenceAttachments
  >();
  for (const attachment of correspondenceAttachments) {
    const current =
      messageAttachmentMap.get(attachment.messageId) ?? [];
    current.push(attachment);
    messageAttachmentMap.set(attachment.messageId, current);
  }

  const threads = new Map<
    string,
    { id: string; subject: string | null }
  >();
  for (const entry of correspondence) {
    threads.set(entry.thread.id, {
      id: entry.thread.id,
      subject: entry.thread.subject,
    });
  }

  const activeTemplates = templates.filter(
    (template) => template.status === "active",
  );

  return (
    <>
      {canViewNotes ? (
      <section>
        <h2>Case notes</h2>
        {notes.length === 0 ? (
          <p>No visible notes have been recorded.</p>
        ) : (
          <ol>
            {notes.map((note) => {
              const attachments =
                noteAttachmentMap.get(note.id) ?? [];
              return (
                <li key={note.id}>
                  <article>
                    <p>
                      <strong>{note.visibility}</strong> ·{" "}
                      {note.createdAt.toISOString()}
                    </p>
                    <p>{note.body}</p>
                    {attachments.length > 0 ? (
                      <ul>
                        {attachments.map(({ version, document }) => (
                          <li key={version.id}>
                            {document.title} — version{" "}
                            {version.versionNumber}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ol>
        )}

        {canCreateInternalNote || canCreateParticipantNote ? (
          <details>
            <summary>Add case note</summary>
            <form action={createCaseNoteAction.bind(null, caseId)}>
              <label>
                Visibility
                <select name="visibility" defaultValue="internal">
                  {canCreateInternalNote ? (
                    <option value="internal">internal</option>
                  ) : null}
                  {canCreateParticipantNote ? (
                    <>
                      <option value="case_participants">
                        case participants
                      </option>
                      <option value="public">public</option>
                    </>
                  ) : null}
                </select>
              </label>
              <label>
                Note
                <textarea name="body" rows={5} required />
              </label>
              {caseDocuments.length > 0 ? (
                <label>
                  Attach existing case documents
                  <select name="documentVersionIds" multiple>
                    {caseDocuments.map(
                      ({ version, document, type }) => (
                        <option
                          key={version.id}
                          value={version.id}
                        >
                          {document.title} — {type.name} — v
                          {version.versionNumber} —{" "}
                          {document.visibility} —{" "}
                          {version.malwareScanStatus}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : null}
              <button type="submit">Add note</button>
            </form>
          </details>
        ) : null}
      </section>
      ) : null}

      {canViewCorrespondence ? (
      <section>
        <h2>Correspondence</h2>
        {correspondence.length === 0 ? (
          <p>No correspondence has been recorded.</p>
        ) : (
          <ol>
            {correspondence.map(({ message, thread }) => {
              const attachments =
                messageAttachmentMap.get(message.id) ?? [];
              return (
                <li key={message.id}>
                  <article>
                    <h3>
                      {message.subject ??
                        thread.subject ??
                        "Untitled correspondence"}
                    </h3>
                    <p>
                      {message.direction} · {message.channel} ·{" "}
                      {message.status} · {message.visibility}
                    </p>
                    <p>
                      Thread: {thread.subject ?? thread.id}
                    </p>
                    {message.senderAddress ? (
                      <p>Sender: {message.senderAddress}</p>
                    ) : null}
                    {message.recipients.length > 0 ? (
                      <p>
                        Recipients:{" "}
                        {message.recipients
                          .map(
                            (recipient) =>
                              `${recipient.type}:${recipient.address}`,
                          )
                          .join(", ")}
                      </p>
                    ) : null}
                    <p>{message.body}</p>
                    <p>
                      Created: {message.createdAt.toISOString()}
                      {message.queuedAt
                        ? ` · queued ${message.queuedAt.toISOString()}`
                        : ""}
                      {message.sentAt
                        ? ` · sent ${message.sentAt.toISOString()}`
                        : ""}
                      {message.receivedAt
                        ? ` · received ${message.receivedAt.toISOString()}`
                        : ""}
                    </p>
                    {message.failureMessage ? (
                      <p role="alert">
                        Delivery failure: {message.failureMessage}
                      </p>
                    ) : null}
                    {message.inReplyToMessageId ? (
                      <p>
                        Reply to message:{" "}
                        <code>{message.inReplyToMessageId}</code>
                      </p>
                    ) : null}
                    {attachments.length > 0 ? (
                      <ul>
                        {attachments.map(({ version, document }) => (
                          <li key={version.id}>
                            {document.title} — version{" "}
                            {version.versionNumber} — SHA-256{" "}
                            <code>{version.sha256}</code>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {canManageCorrespondence &&
                    message.direction === "outbound" &&
                    (message.status === "draft" ||
                      message.status === "failed") ? (
                      <form
                        action={queueCorrespondenceAction.bind(
                          null,
                          caseId,
                          message.id,
                        )}
                      >
                        <button type="submit">
                          {message.status === "failed"
                            ? "Requeue delivery"
                            : "Queue for delivery"}
                        </button>
                      </form>
                    ) : null}

                    {canManageCorrespondence &&
                    message.direction === "outbound" &&
                    message.status === "queued" ? (
                      <details>
                        <summary>Record externally sent</summary>
                        <form
                          action={recordCorrespondenceSentAction.bind(
                            null,
                            caseId,
                            message.id,
                          )}
                        >
                          <label>
                            External message/reference ID (optional)
                            <input name="externalMessageId" />
                          </label>
                          <button type="submit">
                            Record sent
                          </button>
                        </form>
                      </details>
                    ) : null}
                  </article>
                </li>
              );
            })}
          </ol>
        )}

        {canManageCorrespondence ? (
          <>
            <details>
              <summary>Compose outbound correspondence</summary>
              <form
                action={createOutboundCorrespondenceAction.bind(
                  null,
                  caseId,
                )}
              >
                <label>
                  Existing thread (optional)
                  <select name="threadId" defaultValue="">
                    <option value="">New thread</option>
                    {[...threads.values()].map((thread) => (
                      <option key={thread.id} value={thread.id}>
                        {thread.subject ?? thread.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Template (optional)
                  <select name="templateId" defaultValue="">
                    <option value="">No template</option>
                    {activeTemplates.map((template) => (
                      <option
                        key={template.id}
                        value={template.id}
                      >
                        {template.name} ({template.channel})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Channel
                  <select name="channel" defaultValue="email">
                    <option value="email">email</option>
                    <option value="letter">letter</option>
                    <option value="portal">portal</option>
                    <option value="manual">manual</option>
                  </select>
                </label>
                <label>
                  Visibility
                  <select
                    name="visibility"
                    defaultValue=""
                  >
                    <option value="">
                      template default / case participants
                    </option>
                    <option value="case_participants">
                      case participants
                    </option>
                    <option value="internal">internal</option>
                    <option value="public">public</option>
                  </select>
                </label>
                <label>
                  Sender address
                  <input name="senderAddress" />
                </label>
                <label>
                  To (comma-separated)
                  <input name="to" required />
                </label>
                <label>
                  Cc (comma-separated)
                  <input name="cc" />
                </label>
                <label>
                  Bcc (comma-separated)
                  <input name="bcc" />
                </label>
                <label>
                  Subject
                  <input name="subject" />
                </label>
                <label>
                  Body
                  <textarea name="body" rows={8} />
                </label>
                {caseDocuments.length > 0 ? (
                  <label>
                    Attach case documents
                    <select name="documentVersionIds" multiple>
                      {caseDocuments.map(
                        ({ version, document, type }) => (
                          <option
                            key={version.id}
                            value={version.id}
                          >
                            {document.title} — {type.name} — v
                            {version.versionNumber} —{" "}
                            {document.visibility} —{" "}
                            {version.malwareScanStatus}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}
                <button type="submit">Create draft</button>
              </form>
            </details>

            <details>
              <summary>Record inbound correspondence</summary>
              <form
                action={recordInboundCorrespondenceAction.bind(
                  null,
                  caseId,
                )}
              >
                <label>
                  Existing thread (optional)
                  <select name="threadId" defaultValue="">
                    <option value="">New thread</option>
                    {[...threads.values()].map((thread) => (
                      <option key={thread.id} value={thread.id}>
                        {thread.subject ?? thread.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Reply to message (optional)
                  <select
                    name="inReplyToMessageId"
                    defaultValue=""
                  >
                    <option value="">No reply linkage</option>
                    {correspondence.map(({ message }) => (
                      <option
                        key={message.id}
                        value={message.id}
                      >
                        {message.subject ??
                          `${message.direction} ${message.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Channel
                  <select name="channel" defaultValue="email">
                    <option value="email">email</option>
                    <option value="letter">letter</option>
                    <option value="portal">portal</option>
                    <option value="manual">manual</option>
                  </select>
                </label>
                <label>
                  Visibility
                  <select
                    name="visibility"
                    defaultValue="case_participants"
                  >
                    <option value="case_participants">
                      case participants
                    </option>
                    <option value="internal">internal</option>
                    <option value="public">public</option>
                  </select>
                </label>
                <label>
                  Sender
                  <input name="senderAddress" />
                </label>
                <label>
                  To (comma-separated)
                  <input name="to" />
                </label>
                <label>
                  Cc (comma-separated)
                  <input name="cc" />
                </label>
                <label>
                  Bcc (comma-separated)
                  <input name="bcc" />
                </label>
                <label>
                  Provider/source
                  <input
                    name="provider"
                    defaultValue="manual-record"
                  />
                </label>
                <label>
                  External message/reference ID
                  <input name="externalMessageId" />
                </label>
                <label>
                  Subject
                  <input name="subject" />
                </label>
                <label>
                  Body
                  <textarea name="body" rows={8} required />
                </label>
                {caseDocuments.length > 0 ? (
                  <label>
                    Attach existing case documents
                    <select name="documentVersionIds" multiple>
                      {caseDocuments.map(
                        ({ version, document, type }) => (
                          <option
                            key={version.id}
                            value={version.id}
                          >
                            {document.title} — {type.name} — v
                            {version.versionNumber} —{" "}
                            {document.visibility} —{" "}
                            {version.malwareScanStatus}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}
                <button type="submit">
                  Record inbound message
                </button>
              </form>
            </details>
          </>
        ) : null}
      </section>
      ) : null}
    </>
  );
}
