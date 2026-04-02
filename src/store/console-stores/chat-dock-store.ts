import { create } from "zustand";
import type { GatewayAdapter } from "@/gateway/adapter";
import { getAdapter } from "@/gateway/adapter-provider";
import type {
  ChatAttachment,
  ChatContentBlock,
  ChatHistoryResult,
  SessionInfo,
  ToolCallInfo,
} from "@/gateway/adapter-types";
import type { AgentEventPayload, GatewayEventFrame } from "@/gateway/types";
import i18n from "@/i18n";
import { exportChatTranscriptMarkdown } from "@/lib/chat-export";
import { buildSlashHelpText, parseSlashCommand } from "@/lib/chat-slash-commands";
import { localPersistence } from "@/lib/local-persistence";
import { generateMessageId } from "@/lib/message-utils";
import { serverPersistence } from "@/lib/server-persistence";

export type MessageRole = "user" | "assistant" | "system";
export type ChatMessageKind = "message" | "tool" | "command";

export interface ChatDockMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: ChatAttachment[];
  toolCalls?: ToolCallInfo[];
  kind?: ChatMessageKind;
  runId?: string | null;
  aborted?: boolean;
  authorAgentId?: string | null;
  collapsed?: boolean;
}

interface ChatDockState {
  messages: ChatDockMessage[];
  isStreaming: boolean;
  currentSessionKey: string;
  targetAgentId: string | null;
  sessions: SessionInfo[];
  error: string | null;
  activeRunId: string | null;
  streamingMessage: Record<string, unknown> | null;
  isHistoryLoaded: boolean;
  isHistoryLoading: boolean;
  draft: string;
  attachments: ChatAttachment[];

  sendMessage: (text: string, attachments?: ChatAttachment[]) => Promise<void>;
  abort: () => Promise<void>;
  switchSession: (key: string) => void;
  newSession: (agentId?: string | null) => void;
  loadSessions: () => Promise<void>;
  loadHistory: () => Promise<void>;
  initializeHistory: () => Promise<void>;
  setTargetAgent: (agentId: string) => void;
  handleChatEvent: (event: Record<string, unknown>) => void;
  handleAgentEvent: (event: AgentEventPayload) => void;
  clearError: () => void;
  initEventListeners: (
    wsClient: {
      onEvent: (name: string, handler: (frame: GatewayEventFrame) => void) => () => void;
    } | null,
  ) => () => void;
  setDraft: (draft: string) => void;
  addAttachment: (attachment: ChatAttachment) => void;
  removeAttachment: (attachmentId: string) => void;
  clearAttachments: () => void;
  clearMessages: () => Promise<void>;
  exportCurrentSession: () => boolean;
}

// --- 헬퍼 함수 ---

function buildSessionKey(agentId: string): string {
  return `agent:${agentId}:main`;
}

const CHAT_LAST_SESSION_KEY = "agent-office-chat:last-session";

function isWorkspaceChatSessionKey(sessionKey: string): boolean {
  return /^agent:[^:]+:(main|session-[^:]+)$/u.test(sessionKey);
}

function filterWorkspaceSessions(sessions: SessionInfo[]): SessionInfo[] {
  return sessions.filter((session) => isWorkspaceChatSessionKey(session.key));
}

function getStoredSessionKey(): string | null {
  try {
    const value = localStorage.getItem(CHAT_LAST_SESSION_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function storeSessionKey(sessionKey: string): void {
  if (!isWorkspaceChatSessionKey(sessionKey)) return;
  try {
    localStorage.setItem(CHAT_LAST_SESSION_KEY, sessionKey);
  } catch {
    // 무시
  }
}

function inferAgentIdFromSessionKey(sessionKey: string): string | null {
  const match = /^agent:([^:]+):/u.exec(sessionKey);
  return match?.[1] ?? null;
}

function resolveSessionAgentId(sessionKey: string, sessions: SessionInfo[]): string | null {
  const session = sessions.find((item) => item.key === sessionKey);
  return session?.agentId ?? inferAgentIdFromSessionKey(sessionKey);
}

function selectPreferredSessionKey(agentId: string, sessions: SessionInfo[]): string {
  const matched = filterWorkspaceSessions(sessions)
    .filter((session) => resolveSessionAgentId(session.key, sessions) === agentId)
    .filter((session) => session.key !== buildSessionKey(agentId))
    .sort((a, b) => {
      const aTime = a.lastActiveAt ?? a.updatedAt ?? a.createdAt ?? 0;
      const bTime = b.lastActiveAt ?? b.updatedAt ?? b.createdAt ?? 0;
      return bTime - aTime;
    });
  return matched[0]?.key ?? buildSessionKey(agentId);
}

function mergeCurrentSession(
  sessions: SessionInfo[],
  currentSessionKey: string,
  targetAgentId: string | null,
): SessionInfo[] {
  const isDefault = currentSessionKey === "agent:main:main" && targetAgentId === null;
  if (isDefault) return sessions;
  if (sessions.some((s) => s.key === currentSessionKey)) return sessions;
  const now = Date.now();
  return [
    normalizeSession({
      key: currentSessionKey,
      agentId: targetAgentId ?? inferAgentIdFromSessionKey(currentSessionKey) ?? undefined,
      label: currentSessionKey,
      createdAt: now,
      lastActiveAt: now,
      messageCount: 0,
    }),
    ...sessions,
  ];
}

function touchSession(
  sessions: SessionInfo[],
  currentSessionKey: string,
  targetAgentId: string | null,
  messageCount: number,
): SessionInfo[] {
  const now = Date.now();
  const existing = sessions.find((s) => s.key === currentSessionKey);
  const nextSession = normalizeSession({
    ...existing,
    key: currentSessionKey,
    agentId: targetAgentId ?? existing?.agentId ?? inferAgentIdFromSessionKey(currentSessionKey) ?? undefined,
    label: existing?.label ?? currentSessionKey,
    createdAt: existing?.createdAt ?? now,
    lastActiveAt: now,
    updatedAt: now,
    messageCount,
  });
  return [nextSession, ...sessions.filter((s) => s.key !== currentSessionKey)];
}

function persistSessions(sessions: SessionInfo[]): void {
  void localPersistence.saveSessions(sessions);
  serverPersistence.saveSessions(sessions);
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as ChatContentBlock[])
      .filter(
        (block): block is Extract<ChatContentBlock, { type: "text" }> =>
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text" &&
          typeof (block as { type: string; text: string }).text === "string",
      )
      .map((block) => (block as { type: string; text: string }).text)
      .join("\n");
  }
  return "";
}

function normalizeRole(role: unknown): MessageRole {
  return role === "user" || role === "assistant" || role === "system" ? role : "assistant";
}

function isAttachmentLike(value: unknown): value is ChatAttachment {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as ChatAttachment).mimeType === "string",
  );
}

function normalizeAttachment(attachment: ChatAttachment): ChatAttachment {
  return {
    id: attachment.id ?? generateMessageId(),
    name: attachment.name,
    mimeType: attachment.mimeType,
    dataUrl: attachment.dataUrl,
    content: attachment.content,
  };
}

function extractAttachments(message: Record<string, unknown>): ChatAttachment[] {
  if (Array.isArray(message.attachments)) {
    return (message.attachments as unknown[]).filter(isAttachmentLike).map(normalizeAttachment);
  }
  return [];
}

function normalizeHistoryMessage(message: Record<string, unknown>): ChatDockMessage {
  return {
    id: String(message.id ?? generateMessageId()),
    role: normalizeRole(message.role),
    content: extractText(message.content ?? message.text ?? ""),
    timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
    attachments: extractAttachments(message),
    toolCalls: Array.isArray(message.toolCalls) ? (message.toolCalls as ToolCallInfo[]) : undefined,
    runId: typeof message.runId === "string" ? message.runId : null,
    aborted: Boolean(message.aborted),
  };
}

function normalizeHistoryMessages(
  messages: Record<string, unknown>[],
  authorAgentId: string | null,
): ChatDockMessage[] {
  return messages.map((message) => {
    const normalized = normalizeHistoryMessage(message);
    return normalized.role === "assistant" ? { ...normalized, authorAgentId } : normalized;
  });
}

function findLatestToolMessageIndex(
  messages: ChatDockMessage[],
  runId: string,
  toolName: string,
): number {
  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const msg = messages[idx];
    if (
      msg?.kind === "tool" &&
      msg.runId === runId &&
      msg.toolCalls?.some((tc) => tc.name === toolName)
    ) {
      return idx;
    }
  }
  return -1;
}

function buildAssistantMessage(
  content: string,
  runId: string | null,
  authorAgentId: string | null,
  source?: Record<string, unknown>,
): ChatDockMessage {
  return {
    id: String(source?.id ?? generateMessageId()),
    role: "assistant",
    content,
    timestamp: Date.now(),
    attachments: source ? extractAttachments(source) : undefined,
    toolCalls: Array.isArray(source?.toolCalls) ? (source.toolCalls as ToolCallInfo[]) : undefined,
    runId,
    aborted: Boolean(source?.aborted),
    authorAgentId,
  };
}

function getAssistantRunContent(messages: ChatDockMessage[], runId: string): string {
  return messages
    .filter((m) => m.role === "assistant" && m.runId === runId)
    .map((m) => m.content)
    .join("\n");
}

function appendAssistantSegment(
  messages: ChatDockMessage[],
  content: string,
  runId: string | null,
  authorAgentId: string | null,
  source?: Record<string, unknown>,
): ChatDockMessage[] {
  if (!content.trim()) return messages;
  if (runId) {
    const existingContent = getAssistantRunContent(messages, runId);
    const normalizedContent =
      existingContent && content.startsWith(existingContent)
        ? content.slice(existingContent.length).replace(/^\n+/u, "")
        : content;
    if (!normalizedContent.trim()) return messages;
    return [...messages, buildAssistantMessage(normalizedContent, runId, authorAgentId, source)];
  }
  return [...messages, buildAssistantMessage(content, runId, authorAgentId, source)];
}

function normalizeSession(session: SessionInfo): SessionInfo {
  return {
    ...session,
    label: session.label ?? session.key,
    lastActiveAt: session.lastActiveAt ?? session.updatedAt ?? Date.now(),
    messageCount: session.messageCount ?? 0,
  };
}

function buildSystemMessage(
  content: string,
  kind: ChatMessageKind = "command",
): ChatDockMessage {
  return {
    id: generateMessageId(),
    role: "system",
    content,
    timestamp: Date.now(),
    kind,
  };
}

async function withAdapter<T>(fn: (adapter: GatewayAdapter) => Promise<T>): Promise<T> {
  const adapter = getAdapter();
  return fn(adapter);
}

localPersistence.open().catch(() => {});

async function executeSlashCommand(
  commandText: string,
  state: ChatDockState,
  set: (
    partial: Partial<ChatDockState> | ((s: ChatDockState) => Partial<ChatDockState>),
  ) => void,
  get: () => ChatDockState,
): Promise<boolean> {
  const parsed = parseSlashCommand(commandText);
  if (!parsed) return false;

  const { command } = parsed;
  const sessionKey = state.currentSessionKey;

  const appendSystemMessage = async (content: string) => {
    const msg = buildSystemMessage(content);
    set((cur) => ({ messages: [...cur.messages, msg] }));
    await localPersistence.saveMessage(sessionKey, msg);
  };

  switch (command.name) {
    case "help":
      await appendSystemMessage(buildSlashHelpText());
      return true;
    case "new":
      get().newSession();
      await appendSystemMessage(i18n.t("chat:slash.feedback.newSession"));
      return true;
    case "reset":
      try {
        await withAdapter((adapter) => adapter.sessionsReset(sessionKey));
      } catch {
        // older gateway
      }
      await get().clearMessages();
      set({ draft: "", attachments: [], isStreaming: false, activeRunId: null, streamingMessage: null });
      await appendSystemMessage(i18n.t("chat:slash.feedback.reset"));
      return true;
    case "stop":
      await get().abort();
      await appendSystemMessage(i18n.t("chat:slash.feedback.stop"));
      return true;
    case "clear":
      await get().clearMessages();
      return true;
    default:
      return false;
  }
}

export const useChatDockStore = create<ChatDockState>((set, get) => ({
  messages: [],
  isStreaming: false,
  currentSessionKey: "agent:main:main",
  targetAgentId: null,
  sessions: [],
  error: null,
  activeRunId: null,
  streamingMessage: null,
  isHistoryLoaded: false,
  isHistoryLoading: false,
  draft: "",
  attachments: [],

  sendMessage: async (text, attachments) => {
    const trimmed = text.trim();
    const outboundAttachments = attachments ?? get().attachments;
    if (!trimmed && outboundAttachments.length === 0) return;

    const slashHandled = await executeSlashCommand(trimmed, get(), set, get);
    if (slashHandled) {
      set({ draft: "", attachments: [] });
      return;
    }

    if (get().isStreaming) return;

    const { currentSessionKey } = get();
    const userMsg: ChatDockMessage = {
      id: generateMessageId(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      attachments: outboundAttachments.length > 0 ? outboundAttachments : undefined,
    };

    const nextSessions = touchSession(
      get().sessions,
      currentSessionKey,
      get().targetAgentId,
      get().messages.length + 1,
    );

    set((state) => ({
      messages: [...state.messages, userMsg],
      sessions: nextSessions,
      isStreaming: true,
      error: null,
      streamingMessage: null,
      draft: "",
      attachments: [],
    }));

    localPersistence.saveMessage(currentSessionKey, userMsg).catch(() => {});
    persistSessions(nextSessions);

    try {
      await withAdapter((adapter) =>
        adapter.chatSend({
          text: trimmed,
          sessionKey: currentSessionKey,
          attachments: outboundAttachments,
        }),
      );
    } catch (err) {
      set({ error: String(err), isStreaming: false });
    }
  },

  abort: async () => {
    const { currentSessionKey } = get();
    set({ isStreaming: false, streamingMessage: null });
    try {
      await withAdapter((adapter) => adapter.chatAbort(currentSessionKey));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  switchSession: (key) => {
    const targetAgentId = resolveSessionAgentId(key, get().sessions);
    storeSessionKey(key);
    set({
      currentSessionKey: key,
      targetAgentId,
      messages: [],
      streamingMessage: null,
      activeRunId: null,
      error: null,
      isStreaming: false,
      isHistoryLoaded: false,
      draft: "",
      attachments: [],
    });
    void get().initializeHistory();
  },

  newSession: (agentId) => {
    const resolvedAgentId = agentId ?? get().targetAgentId ?? "main";
    const newKey = `agent:${resolvedAgentId}:session-${Date.now()}`;
    const sessions = [
      {
        key: newKey,
        agentId: resolvedAgentId,
        label: newKey,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        messageCount: 0,
      },
      ...get().sessions.filter((s) => s.key !== newKey),
    ].map(normalizeSession);
    set({
      currentSessionKey: newKey,
      targetAgentId: resolvedAgentId,
      messages: [],
      streamingMessage: null,
      activeRunId: null,
      error: null,
      isStreaming: false,
      isHistoryLoaded: true,
      isHistoryLoading: false,
      draft: "",
      attachments: [],
      sessions,
    });
    storeSessionKey(newKey);
    void localPersistence.clearMessages(newKey);
    persistSessions(sessions);
  },

  loadSessions: async () => {
    const current = get();
    const idbCached = await localPersistence.getSessions();
    if (idbCached.sessions.length > 0) {
      const normalized = filterWorkspaceSessions(idbCached.sessions.map(normalizeSession));
      set({
        sessions: mergeCurrentSession(normalized, current.currentSessionKey, current.targetAgentId),
      });
    }
    try {
      const result = await withAdapter((adapter) => adapter.sessionsList());
      const normalized = filterWorkspaceSessions(result.map(normalizeSession));
      const merged = mergeCurrentSession(normalized, get().currentSessionKey, get().targetAgentId);
      set({ sessions: merged });
      persistSessions(merged);
    } catch {
      // 세션은 기본 채팅에서 선택 사항
    }
  },

  loadHistory: async () => {
    const { currentSessionKey } = get();
    try {
      const result = await withAdapter((adapter) => adapter.chatHistory(currentSessionKey));
      const authorAgentId =
        resolveSessionAgentId(currentSessionKey, get().sessions) ?? get().targetAgentId;
      const messages = normalizeHistoryMessages(
        result.messages as unknown as Record<string, unknown>[],
        authorAgentId,
      );
      const nextSessions = touchSession(
        get().sessions,
        currentSessionKey,
        get().targetAgentId,
        messages.length,
      );
      set({ messages, sessions: nextSessions });
      await localPersistence.saveMessages(currentSessionKey, messages);
      persistSessions(nextSessions);
    } catch {
      set({ messages: [] });
    }
  },

  initializeHistory: async () => {
    const { currentSessionKey } = get();
    set({ isHistoryLoading: true });

    let cacheHit = false;
    const authorAgentId =
      resolveSessionAgentId(currentSessionKey, get().sessions) ?? get().targetAgentId;

    // Layer 1: IndexedDB 캐시
    try {
      const idbCached = await localPersistence.getMessages(currentSessionKey);
      if (idbCached.length > 0) {
        const nextSessions = touchSession(
          get().sessions,
          currentSessionKey,
          get().targetAgentId,
          idbCached.length,
        );
        set({
          messages: idbCached as ChatDockMessage[],
          sessions: nextSessions,
          isHistoryLoaded: true,
          isHistoryLoading: false,
        });
        persistSessions(nextSessions);
        cacheHit = true;
      }
    } catch {
      // 캐시 미스
    }

    // Layer 2: Gateway RPC 요청
    try {
      const result: ChatHistoryResult = await withAdapter((adapter) =>
        adapter.chatHistory(currentSessionKey),
      );
      const gatewayMessages = normalizeHistoryMessages(
        result.messages as unknown as Record<string, unknown>[],
        authorAgentId,
      );
      if (gatewayMessages.length > 0) {
        const current = get();
        const shouldUpdate =
          !cacheHit || gatewayMessages.length !== current.messages.length;
        if (shouldUpdate) {
          const nextSessions = touchSession(
            get().sessions,
            currentSessionKey,
            get().targetAgentId,
            gatewayMessages.length,
          );
          set({
            messages: gatewayMessages,
            sessions: nextSessions,
            isHistoryLoaded: true,
            isHistoryLoading: false,
          });
          persistSessions(nextSessions);
        }
        void localPersistence.saveMessages(currentSessionKey, gatewayMessages);
      } else if (!cacheHit) {
        set({ messages: [], isHistoryLoaded: true, isHistoryLoading: false });
      }
    } catch {
      if (!cacheHit) {
        set({ messages: [], isHistoryLoaded: true, isHistoryLoading: false });
      }
    }

    if (!get().isHistoryLoaded) {
      set({ isHistoryLoaded: true, isHistoryLoading: false });
    }
  },

  setTargetAgent: (agentId) => {
    const storedSessionKey = getStoredSessionKey();
    const storedAgentId =
      storedSessionKey && isWorkspaceChatSessionKey(storedSessionKey)
        ? resolveSessionAgentId(storedSessionKey, get().sessions)
        : null;
    const sessionKey =
      storedSessionKey && storedAgentId === agentId
        ? storedSessionKey
        : selectPreferredSessionKey(agentId, get().sessions);
    if (sessionKey === buildSessionKey(agentId)) {
      get().newSession(agentId);
      return;
    }
    storeSessionKey(sessionKey);
    set({
      targetAgentId: agentId,
      currentSessionKey: sessionKey,
      messages: [],
      streamingMessage: null,
      activeRunId: null,
      error: null,
      isStreaming: false,
      isHistoryLoaded: false,
    });
    void get().initializeHistory();
  },

  handleChatEvent: (event) => {
    const eventSessionKey =
      typeof event.sessionKey === "string" && event.sessionKey.length > 0
        ? event.sessionKey
        : get().currentSessionKey;
    if (eventSessionKey !== get().currentSessionKey) return;

    const eventState = String(event.state || "");
    const runId = String(event.runId || "");
    const message = event.message as Record<string, unknown> | undefined;

    let resolvedState = eventState;
    if (!resolvedState && message) {
      const stopReason = message.stopReason ?? message.stop_reason;
      if (stopReason) {
        resolvedState = "final";
      } else if (message.role || message.content) {
        resolvedState = "delta";
      }
    }

    switch (resolvedState) {
      case "delta": {
        if (message) {
          set({
            streamingMessage: message,
            activeRunId: runId || get().activeRunId,
            isStreaming: true,
          });
        }
        break;
      }
      case "final": {
        const assistantText = message
          ? extractText(message.content ?? message.text ?? "")
          : "";
        if (assistantText) {
          const authorAgentId =
            resolveSessionAgentId(get().currentSessionKey, get().sessions) ??
            get().targetAgentId;
          const nextSessions = touchSession(
            get().sessions,
            get().currentSessionKey,
            get().targetAgentId,
            get().messages.length + 1,
          );
          set((state) => ({
            messages: appendAssistantSegment(
              state.messages,
              assistantText,
              runId || null,
              authorAgentId,
              message,
            ),
            sessions: nextSessions,
            isStreaming: false,
            streamingMessage: null,
            activeRunId: null,
          }));
          const { currentSessionKey, messages, targetAgentId: agentId } = get();
          void localPersistence.saveMessages(currentSessionKey, messages);
          persistSessions(nextSessions);
        } else {
          set({ isStreaming: false, streamingMessage: null, activeRunId: null });
          void get().loadHistory();
        }
        break;
      }
      case "error": {
        const errorMsg = String(
          event.errorMessage || i18n.t("common:errors.errorOccurred"),
        );
        set({ error: errorMsg, isStreaming: false, streamingMessage: null, activeRunId: null });
        break;
      }
      case "aborted": {
        set({ isStreaming: false, streamingMessage: null, activeRunId: null });
        void get().loadHistory();
        break;
      }
      default: {
        if (get().isStreaming && message) {
          set({ streamingMessage: message });
        }
      }
    }
  },

  handleAgentEvent: (event) => {
    if (event.sessionKey && event.sessionKey !== get().currentSessionKey) return;
    if (event.stream !== "tool") return;

    const phase = typeof event.data.phase === "string" ? event.data.phase : "";
    const name = typeof event.data.name === "string" ? event.data.name : "unknown";
    const args = event.data.args as Record<string, unknown> | undefined;
    const toolCallStatus = phase === "start" ? "running" : "done";
    const authorAgentId =
      resolveSessionAgentId(get().currentSessionKey, get().sessions) ?? get().targetAgentId;
    const toolCall: ToolCallInfo = {
      id: `${event.runId}:${event.seq}`,
      name,
      args,
      status: toolCallStatus,
    };

    set((state) => {
      const currentStreamingText = extractText(
        state.streamingMessage?.content ?? state.streamingMessage?.text ?? "",
      );
      const nextMessages =
        phase === "start"
          ? appendAssistantSegment(
              state.messages,
              currentStreamingText,
              state.activeRunId ?? event.runId,
              authorAgentId,
              state.streamingMessage ?? undefined,
            )
          : [...state.messages];
      const existingIndex = findLatestToolMessageIndex(nextMessages, event.runId, name);
      if (existingIndex >= 0) {
        const mergedMessages = [...nextMessages];
        const existing = mergedMessages[existingIndex]!;
        mergedMessages[existingIndex] = {
          ...existing,
          content:
            phase === "start"
              ? i18n.t("chat:toolActivity.calling", { name })
              : i18n.t("chat:toolActivity.finished", { name }),
          timestamp: Date.now(),
          collapsed: toolCallStatus !== "running",
          toolCalls: (existing.toolCalls ?? []).map((tc) =>
            tc.name === name
              ? { ...tc, args: args ?? tc.args, status: toolCallStatus }
              : tc,
          ),
        };
        return {
          messages: mergedMessages,
          streamingMessage: phase === "start" ? null : state.streamingMessage,
        };
      }

      return {
        messages: [
          ...nextMessages,
          {
            ...buildSystemMessage(
              phase === "start"
                ? i18n.t("chat:toolActivity.calling", { name })
                : i18n.t("chat:toolActivity.finished", { name }),
              "tool",
            ),
            authorAgentId,
            runId: event.runId,
            collapsed: toolCallStatus !== "running",
            toolCalls: [toolCall],
          },
        ],
        streamingMessage: phase === "start" ? null : state.streamingMessage,
      };
    });
    const { currentSessionKey, messages, targetAgentId: agentId } = get();
    void localPersistence.saveMessages(currentSessionKey, messages);
    serverPersistence.saveMessages(currentSessionKey, messages, agentId);
  },

  clearError: () => set({ error: null }),

  initEventListeners: (wsClient) => {
    if (!wsClient) return () => {};
    const unsubChat = wsClient.onEvent("chat", (frame: GatewayEventFrame) => {
      get().handleChatEvent(frame.payload as Record<string, unknown>);
    });
    const unsubAgent = wsClient.onEvent("agent", (frame: GatewayEventFrame) => {
      get().handleAgentEvent(frame.payload as AgentEventPayload);
    });
    return () => {
      unsubChat();
      unsubAgent();
    };
  },

  setDraft: (draft) => set({ draft }),

  addAttachment: (attachment) =>
    set((state) => ({
      attachments: [...state.attachments, normalizeAttachment(attachment)],
    })),

  removeAttachment: (attachmentId) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== attachmentId),
    })),

  clearAttachments: () => set({ attachments: [] }),

  clearMessages: async () => {
    const { currentSessionKey } = get();
    set({ messages: [] });
    await localPersistence.clearMessages(currentSessionKey);
    void serverPersistence.clearMessages(currentSessionKey);
  },

  exportCurrentSession: () =>
    exportChatTranscriptMarkdown(get().messages, get().currentSessionKey),
}));
