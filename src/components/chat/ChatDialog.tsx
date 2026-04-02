import { ArrowDown, Loader2, Paperclip, Send, Square } from "lucide-react";
import { useRef, useEffect, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import TextareaAutosize from "react-textarea-autosize";
import { useChatDockStore, type ChatDockMessage } from "@/store/console-stores/chat-dock-store";
import { AgentSelector } from "./AgentSelector";
import { MessageBubble } from "./MessageBubble";
import { SessionSwitcher } from "./SessionSwitcher";

function extractStreamingText(streamingMessage: Record<string, unknown> | null): string {
  if (!streamingMessage) return "";
  const content = streamingMessage.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type?: string; text?: string }>)
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!)
      .join("\n");
  }
  return "";
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ChatDialog() {
  const { t } = useTranslation("chat");
  const messages = useChatDockStore((s) => s.messages);
  const isStreaming = useChatDockStore((s) => s.isStreaming);
  const streamingMessage = useChatDockStore((s) => s.streamingMessage);
  const isHistoryLoading = useChatDockStore((s) => s.isHistoryLoading);
  const sendMessage = useChatDockStore((s) => s.sendMessage);
  const abort = useChatDockStore((s) => s.abort);
  const error = useChatDockStore((s) => s.error);
  const clearError = useChatDockStore((s) => s.clearError);
  const targetAgentId = useChatDockStore((s) => s.targetAgentId);
  const draft = useChatDockStore((s) => s.draft);
  const setDraft = useChatDockStore((s) => s.setDraft);
  const attachments = useChatDockStore((s) => s.attachments);
  const addAttachment = useChatDockStore((s) => s.addAttachment);
  const clearAttachments = useChatDockStore((s) => s.clearAttachments);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isComposing, setIsComposing] = useState(false);

  const streamingText = extractStreamingText(streamingMessage);
  const canSend = (draft.trim().length > 0 || attachments.length > 0) && !isStreaming;

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  const handleSend = useCallback(() => {
    if ((!draft.trim() && attachments.length === 0) || isStreaming) return;
    void sendMessage(draft, attachments);
  }, [attachments, draft, isStreaming, sendMessage]);

  const handleAttachmentChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      for (const file of files) {
        const dataUrl = await readFileAsDataUrl(file);
        addAttachment({
          id: `${file.name}-${file.lastModified}`,
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          dataUrl,
        });
      }
      event.target.value = "";
    },
    [addAttachment],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !isComposing) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, isComposing],
  );

  const allMessages: ChatDockMessage[] = [...messages];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-gray-800">
        <SessionSwitcher />
        <AgentSelector />
      </div>

      {/* Loading state */}
      {isHistoryLoading && (
        <div className="flex shrink-0 items-center justify-center gap-2 py-3 text-sm text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t("chatDialog.loadingHistory")}</span>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {allMessages.length === 0 && !isStreaming && !isHistoryLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {t("dock.startNewChat")}
          </div>
        ) : (
          <>
            {allMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isStreaming && streamingText && (
              <MessageBubble
                message={{
                  id: "__streaming__",
                  role: "assistant",
                  content: streamingText,
                  timestamp: Date.now(),
                  isStreaming: true,
                  authorAgentId: targetAgentId,
                }}
              />
            )}
            {isStreaming && !streamingText && (
              <div className="mb-3 flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-400 dark:bg-gray-800">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                  <span>{t("dock.thinkingStatus")}</span>
                </div>
              </div>
            )}
          </>
        )}

        {!autoScroll && (
          <button
            type="button"
            onClick={scrollToBottom}
            title={t("chatDialog.scrollToBottom")}
            className="sticky bottom-2 left-full z-10 -mr-2 flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white shadow-md hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <ArrowDown className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex shrink-0 items-center justify-between bg-red-50 px-3 py-1.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          <span className="truncate">{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="rounded-full bg-gray-100 px-2 py-1 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-300"
              >
                {attachment.name ?? attachment.mimeType}
              </span>
            ))}
            <button
              type="button"
              onClick={clearAttachments}
              className="text-[11px] font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {t("page.clearAttachments")}
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAttachmentChange}
            className="hidden"
          />
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            title={t("page.addAttachment")}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <TextareaAutosize
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={t("dock.placeholder")}
            maxRows={6}
            className="flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:placeholder:text-gray-500 dark:focus:border-blue-500 dark:focus:bg-gray-900"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={() => void abort()}
              className="rounded-lg bg-red-500 p-2 text-white transition-colors hover:bg-red-600"
              title={t("dock.thinkingStatus")}
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={`rounded-lg p-2 transition-colors ${
                canSend
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-gray-200 text-gray-400 dark:bg-gray-700"
              }`}
              title={t("send")}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
