// IndexedDB 기반 로컬 캐시

import type { EventHistoryItem } from "@/gateway/types";
import type { SessionInfo } from "@/gateway/adapter-types";

interface LocalPersistenceOptions {
  dbName?: string;
  version?: number;
  maxEvents?: number;
  eventExpireDays?: number;
}

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  attachments?: unknown[];
  toolCalls?: unknown[];
  kind?: string;
  runId?: string | null;
  aborted?: boolean;
  authorAgentId?: string | null;
  collapsed?: boolean;
}

interface SessionsRecord {
  id: string;
  sessions: SessionInfo[];
  updatedAt: number;
}

const DEFAULT_DB_NAME = "agent-office-cache";
const DEFAULT_VERSION = 2;
const DEFAULT_MAX_EVENTS = 1000;
const DEFAULT_EVENT_EXPIRE_DAYS = 7;

const STORE_EVENTS = "event_history";
const STORE_CHAT_MESSAGES = "chat_messages";
const STORE_SESSIONS = "chat_sessions";

class LocalPersistence {
  private db: IDBDatabase | null = null;
  private available = true;
  private readonly dbName: string;
  private readonly version: number;
  private readonly maxEvents: number;
  private readonly eventExpireDays: number;

  constructor(options?: LocalPersistenceOptions) {
    this.dbName = options?.dbName ?? DEFAULT_DB_NAME;
    this.version = options?.version ?? DEFAULT_VERSION;
    this.maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
    this.eventExpireDays = options?.eventExpireDays ?? DEFAULT_EVENT_EXPIRE_DAYS;
  }

  async open(): Promise<void> {
    if (this.db) return;
    try {
      if (typeof indexedDB === "undefined") {
        this.available = false;
        return;
      }
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(this.dbName, this.version);
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_EVENTS)) {
            const store = db.createObjectStore(STORE_EVENTS, { autoIncrement: true });
            store.createIndex("timestamp", "timestamp");
          }
          if (!db.objectStoreNames.contains(STORE_CHAT_MESSAGES)) {
            const store = db.createObjectStore(STORE_CHAT_MESSAGES, { keyPath: "storageKey" });
            store.createIndex("sessionKey", "sessionKey");
          }
          if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
            db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.available = false;
    }
  }

  async saveEvents(events: EventHistoryItem[]): Promise<void> {
    if (!this.available) return;
    await this.open();
    if (!this.db) return;

    try {
      const tx = this.db.transaction(STORE_EVENTS, "readwrite");
      const store = tx.objectStore(STORE_EVENTS);
      for (const event of events) {
        store.add(event);
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      await this.pruneOldEvents();
    } catch {
      // 스토리지 에러 무시
    }
  }

  async loadEvents(): Promise<EventHistoryItem[]> {
    if (!this.available) return [];
    await this.open();
    if (!this.db) return [];

    try {
      const cutoff = Date.now() - this.eventExpireDays * 24 * 3600_000;
      return await new Promise<EventHistoryItem[]>((resolve, reject) => {
        const tx = this.db!.transaction(STORE_EVENTS, "readonly");
        const store = tx.objectStore(STORE_EVENTS);
        const idx = store.index("timestamp");
        const range = IDBKeyRange.lowerBound(cutoff);
        const req = idx.getAll(range);
        req.onsuccess = () => resolve((req.result as EventHistoryItem[]) ?? []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  async saveMessage(sessionKey: string, message: ChatMessage): Promise<void> {
    if (!this.available) return;
    await this.open();
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_CHAT_MESSAGES, "readwrite");
      const store = tx.objectStore(STORE_CHAT_MESSAGES);
      // Load existing record and update
      const existing = await new Promise<{ storageKey: string; sessionKey: string; messages: ChatMessage[] } | undefined>((resolve) => {
        const req = store.get(sessionKey);
        req.onsuccess = () => resolve(req.result as { storageKey: string; sessionKey: string; messages: ChatMessage[] } | undefined);
        req.onerror = () => resolve(undefined);
      });
      const messages = existing?.messages ?? [];
      const idx = messages.findIndex((m) => m.id === message.id);
      if (idx >= 0) {
        messages[idx] = message;
      } else {
        messages.push(message);
      }
      store.put({ storageKey: sessionKey, sessionKey, messages });
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // 무시
    }
  }

  async saveMessages(sessionKey: string, messages: ChatMessage[]): Promise<void> {
    if (!this.available) return;
    await this.open();
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_CHAT_MESSAGES, "readwrite");
      const store = tx.objectStore(STORE_CHAT_MESSAGES);
      store.put({ storageKey: sessionKey, sessionKey, messages });
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // 무시
    }
  }

  async getMessages(sessionKey: string): Promise<ChatMessage[]> {
    if (!this.available) return [];
    await this.open();
    if (!this.db) return [];
    try {
      return await new Promise<ChatMessage[]>((resolve) => {
        const tx = this.db!.transaction(STORE_CHAT_MESSAGES, "readonly");
        const store = tx.objectStore(STORE_CHAT_MESSAGES);
        const req = store.get(sessionKey);
        req.onsuccess = () => {
          const record = req.result as { messages: ChatMessage[] } | undefined;
          resolve(record?.messages ?? []);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async clearMessages(sessionKey: string): Promise<void> {
    if (!this.available) return;
    await this.open();
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_CHAT_MESSAGES, "readwrite");
      tx.objectStore(STORE_CHAT_MESSAGES).delete(sessionKey);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // 무시
    }
  }

  async saveSessions(sessions: SessionInfo[]): Promise<void> {
    if (!this.available) return;
    await this.open();
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_SESSIONS, "readwrite");
      const store = tx.objectStore(STORE_SESSIONS);
      const record: SessionsRecord = { id: "sessions", sessions, updatedAt: Date.now() };
      store.put(record);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      // 무시
    }
  }

  async getSessions(): Promise<{ sessions: SessionInfo[] }> {
    if (!this.available) return { sessions: [] };
    await this.open();
    if (!this.db) return { sessions: [] };
    try {
      return await new Promise<{ sessions: SessionInfo[] }>((resolve) => {
        const tx = this.db!.transaction(STORE_SESSIONS, "readonly");
        const store = tx.objectStore(STORE_SESSIONS);
        const req = store.get("sessions");
        req.onsuccess = () => {
          const record = req.result as SessionsRecord | undefined;
          resolve({ sessions: record?.sessions ?? [] });
        };
        req.onerror = () => resolve({ sessions: [] });
      });
    } catch {
      return { sessions: [] };
    }
  }

  private async pruneOldEvents(): Promise<void> {
    if (!this.db) return;
    try {
      const cutoff = Date.now() - this.eventExpireDays * 24 * 3600_000;
      const tx = this.db.transaction(STORE_EVENTS, "readwrite");
      const store = tx.objectStore(STORE_EVENTS);
      const idx = store.index("timestamp");
      const range = IDBKeyRange.upperBound(cutoff);
      const req = idx.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // 최대 개수 초과분 삭제
      const countReq = store.count();
      countReq.onsuccess = () => {
        const count = countReq.result;
        if (count > this.maxEvents) {
          const deleteCount = count - this.maxEvents;
          const cursorReq = store.openCursor();
          let deleted = 0;
          cursorReq.onsuccess = () => {
            const c = cursorReq.result;
            if (c && deleted < deleteCount) {
              c.delete();
              deleted++;
              c.continue();
            }
          };
        }
      };
    } catch {
      // 프루닝 실패는 무시
    }
  }

  async clearAll(): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_EVENTS, "readwrite");
      tx.objectStore(STORE_EVENTS).clear();
    } catch {
      // 무시
    }
  }
}

export const localPersistence = new LocalPersistence();
