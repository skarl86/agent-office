// 서버 캐시 stub — 실제 API가 없으므로 no-op 구현
import type { ChatDockMessage } from "@/store/console-stores/chat-dock-store";
import type { SessionInfo } from "@/gateway/adapter-types";

interface ServerCacheSessionsResponse {
  sessions: SessionInfo[];
  cachedAt: number | null;
}

export const serverPersistence = {
  async getMessages(_sessionKey: string): Promise<ChatDockMessage[]> {
    return [];
  },

  saveMessages(
    _sessionKey: string,
    _messages: ChatDockMessage[],
    _agentId?: string | null,
  ): void {
    // no-op
  },

  saveMessagesImmediate(
    _sessionKey: string,
    _messages: ChatDockMessage[],
    _agentId?: string | null,
  ): void {
    // no-op
  },

  async clearMessages(_sessionKey: string): Promise<void> {
    // no-op
  },

  async getSessions(): Promise<ServerCacheSessionsResponse> {
    return { sessions: [], cachedAt: null };
  },

  saveSessions(_sessions: SessionInfo[]): void {
    // no-op
  },
};
