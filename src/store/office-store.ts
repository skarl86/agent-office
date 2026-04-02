import { enableMapSet } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { parseAgentEvent } from "@/gateway/event-parser";
import type {
  AgentEventPayload,
  AgentSummary,
  AgentToAgentConfig,
  CollaborationLink,
  ConnectionStatus,
  EventHistoryItem,
  GlobalMetrics,
  OfficeStore,
  PageId,
  SubAgentInfo,
  ThemeMode,
  TokenSnapshot,
  VisualAgent,
} from "@/gateway/types";
import { allocatePosition } from "@/lib/position-allocator";
import { extractAgentIdFromSessionKey, isSubAgentSessionKey } from "@/lib/session-key-utils";
import { DEFAULT_MAX_SUB_AGENTS } from "@/lib/constants";

enableMapSet();

const THEME_STORAGE_KEY = "openclaw-theme";
const EVENT_HISTORY_LIMIT = 200;

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function positionKey(pos: { x: number; y: number }): string {
  return `${pos.x},${pos.y}`;
}

function createVisualAgent(
  id: string,
  name: string,
  isSubAgent: boolean,
  agents: Map<string, VisualAgent>,
): VisualAgent {
  const occupied = new Set<string>();
  for (const a of agents.values()) {
    occupied.add(positionKey(a.position));
  }
  const position = allocatePosition(id, isSubAgent, occupied);
  return {
    id,
    name,
    status: "idle",
    position,
    currentTool: null,
    speechBubble: null,
    lastActiveAt: Date.now(),
    toolCallCount: 0,
    toolCallHistory: [],
    runId: null,
    isSubAgent,
    isPlaceholder: false,
    parentAgentId: null,
    childAgentIds: [],
    zone: isSubAgent ? "hotDesk" : "desk",
    originalPosition: null,
    movement: null,
    confirmed: true,
    arrivedAtHotDeskAt: isSubAgent ? Date.now() : null,
    pendingRetire: false,
    arrivedAtMeetingAt: null,
    manualMeeting: false,
  };
}

const defaultMetrics: GlobalMetrics = {
  activeAgents: 0,
  totalAgents: 0,
  totalTokens: 0,
  tokenRate: 0,
  collaborationHeat: 0,
};

export const useOfficeStore = create<OfficeStore>()(
  immer((set, get) => ({
    // State
    agents: new Map<string, VisualAgent>(),
    links: [] as CollaborationLink[],
    globalMetrics: { ...defaultMetrics },
    connectionStatus: "connecting" as ConnectionStatus,
    connectionError: null,
    selectedAgentId: null,
    eventHistory: [] as EventHistoryItem[],
    sidebarCollapsed: false,
    sidebarMobileOpen: false,
    theme: getInitialTheme(),
    currentPage: "office" as PageId,
    operatorScopes: [] as string[],
    tokenHistory: [] as TokenSnapshot[],
    agentCosts: {} as Record<string, number>,
    runIdMap: new Map<string, string>(),
    sessionKeyMap: new Map<string, string[]>(),
    lastSessionsSnapshot: null,
    maxSubAgents: DEFAULT_MAX_SUB_AGENTS,
    agentToAgentConfig: { enabled: false, allow: [] } as AgentToAgentConfig,
    chatDockHeight: 300,

    // Agent CRUD
    addAgent: (agent) => {
      set((state) => {
        state.agents.set(agent.id, agent);
      });
    },

    updateAgent: (id, patch) => {
      set((state) => {
        const agent = state.agents.get(id);
        if (agent) {
          Object.assign(agent, patch);
        }
      });
    },

    removeAgent: (id) => {
      set((state) => {
        state.agents.delete(id);
      });
    },

    initAgents: (summaries: AgentSummary[]) => {
      set((state) => {
        state.agents.clear();
        for (const summary of summaries) {
          const agent = createVisualAgent(
            summary.id,
            summary.identity?.name ?? summary.name ?? summary.id,
            false,
            state.agents,
          );
          state.agents.set(summary.id, agent);
        }
      });
    },

    syncMainAgents: (summaries: AgentSummary[]) => {
      set((state) => {
        const existingIds = new Set(
          [...state.agents.values()].filter((a) => !a.isSubAgent).map((a) => a.id),
        );
        const incomingIds = new Set(summaries.map((s) => s.id));

        // Add new main agents
        for (const summary of summaries) {
          if (!existingIds.has(summary.id)) {
            const agent = createVisualAgent(
              summary.id,
              summary.identity?.name ?? summary.name ?? summary.id,
              false,
              state.agents,
            );
            state.agents.set(summary.id, agent);
          } else {
            // Update name if changed
            const existing = state.agents.get(summary.id);
            if (existing) {
              const newName = summary.identity?.name ?? summary.name ?? summary.id;
              if (existing.name !== newName) {
                existing.name = newName;
              }
            }
          }
        }

        // Remove departed main agents (not sub-agents)
        for (const id of existingIds) {
          if (!incomingIds.has(id)) {
            const agent = state.agents.get(id);
            if (agent && !agent.isSubAgent) {
              state.agents.delete(id);
            }
          }
        }
      });
    },

    addSubAgent: (parentId, info: SubAgentInfo) => {
      set((state) => {
        if (state.agents.has(info.agentId)) return;
        const agent = createVisualAgent(info.agentId, info.label, true, state.agents);
        agent.parentAgentId = parentId;
        state.agents.set(info.agentId, agent);

        const parent = state.agents.get(parentId);
        if (parent && !parent.childAgentIds.includes(info.agentId)) {
          parent.childAgentIds.push(info.agentId);
        }

        // Update session key map
        const keys = state.sessionKeyMap.get(info.requesterSessionKey) ?? [];
        if (!keys.includes(parentId)) {
          state.sessionKeyMap.set(info.requesterSessionKey, [...keys, parentId]);
        }
      });
    },

    removeSubAgent: (subAgentId) => {
      set((state) => {
        const agent = state.agents.get(subAgentId);
        if (agent?.parentAgentId) {
          const parent = state.agents.get(agent.parentAgentId);
          if (parent) {
            parent.childAgentIds = parent.childAgentIds.filter((id) => id !== subAgentId);
          }
        }
        state.agents.delete(subAgentId);
      });
    },

    retireSubAgent: (subAgentId) => {
      set((state) => {
        const agent = state.agents.get(subAgentId);
        if (agent) {
          agent.pendingRetire = true;
          agent.status = "offline";
        }
      });
      // Actually remove after a delay
      setTimeout(() => {
        get().removeSubAgent(subAgentId);
      }, 3000);
    },

    setSessionsSnapshot: (snapshot) => {
      set((state) => {
        state.lastSessionsSnapshot = snapshot;
        // Auto-add sub-agents that aren't in the agents map yet
        for (const session of snapshot.sessions) {
          if (!session.agentId || state.agents.has(session.agentId)) continue;
          // Determine parent from sessionKey
          const parentId = extractAgentIdFromSessionKey(session.sessionKey);
          if (!parentId || !state.agents.has(parentId)) continue;
          const agent = createVisualAgent(session.agentId, session.label || session.agentId, true, state.agents);
          agent.parentAgentId = parentId;
          state.agents.set(session.agentId, agent);
          const parent = state.agents.get(parentId);
          if (parent && !parent.childAgentIds.includes(session.agentId)) {
            parent.childAgentIds.push(session.agentId);
          }
        }
      });
    },

    processAgentEvent: (event: AgentEventPayload) => {
      set((state) => {
        // Find agent by runId or sessionKey
        let agentId: string | null = null;

        // Handle sub-agent events: if sessionKey is a sub-agent key,
        // auto-create the sub-agent in HOT DESK if not already present
        if (event.sessionKey && isSubAgentSessionKey(event.sessionKey)) {
          const parentId = extractAgentIdFromSessionKey(event.sessionKey);
          // Use sessionKey as the sub-agent's unique id
          const subId = event.sessionKey;
          if (!state.agents.has(subId) && parentId && state.agents.has(parentId)) {
            const subName = (event.data.agentId as string) || `sub-${subId.slice(-8)}`;
            const sub = createVisualAgent(subId, subName, true, state.agents);
            sub.parentAgentId = parentId;
            state.agents.set(subId, sub);
            const parent = state.agents.get(parentId);
            if (parent && !parent.childAgentIds.includes(subId)) {
              parent.childAgentIds.push(subId);
            }
          }
          if (state.agents.has(subId)) {
            agentId = subId;
          }
        }

        // Priority 1: Extract from sessionKey directly (most reliable for main agents)
        if (!agentId && event.sessionKey && !isSubAgentSessionKey(event.sessionKey)) {
          const extracted = extractAgentIdFromSessionKey(event.sessionKey);
          if (extracted && state.agents.has(extracted)) {
            agentId = extracted;
          }
        }

        // Priority 2: Check event.data for explicit agentId
        if (!agentId && event.data.agentId && typeof event.data.agentId === "string") {
          if (state.agents.has(event.data.agentId)) {
            agentId = event.data.agentId;
          }
        }

        // Priority 3: sessionKeyMap
        if (!agentId && event.sessionKey) {
          const ids = state.sessionKeyMap.get(event.sessionKey);
          if (ids && ids.length > 0) {
            agentId = ids[0] ?? null;
          }
        }

        if (!agentId) {
          for (const [id, agent] of state.agents) {
            if (agent.runId === event.runId) {
              agentId = id;
              break;
            }
          }
        }

        if (!agentId) {
          // Try runIdMap
          agentId = state.runIdMap.get(event.runId) ?? null;
        }

        if (!agentId) {
          // Last resort: first non-subagent
          for (const [id, agent] of state.agents) {
            if (!agent.isSubAgent) {
              agentId = id;
              break;
            }
          }
        }

        if (!agentId) return;

        const agent = state.agents.get(agentId);
        if (!agent) return;

        const parsed = parseAgentEvent(event);

        agent.status = parsed.status;
        agent.lastActiveAt = Date.now();
        agent.runId = parsed.runId;

        if (parsed.currentTool !== null) {
          agent.currentTool = parsed.currentTool;
        }
        if (parsed.clearTool) {
          agent.currentTool = null;
        }
        if (parsed.speechBubble !== null) {
          agent.speechBubble = parsed.speechBubble;
        }
        if (parsed.clearSpeech) {
          agent.speechBubble = null;
        }
        if (parsed.incrementToolCount) {
          agent.toolCallCount += 1;
        }
        if (parsed.toolRecord) {
          agent.toolCallHistory = [parsed.toolRecord, ...agent.toolCallHistory].slice(0, 20);
        }

        // Update sessionKeyMap
        if (parsed.sessionKey && agentId) {
          const existing = state.sessionKeyMap.get(parsed.sessionKey) ?? [];
          if (!existing.includes(agentId)) {
            state.sessionKeyMap.set(parsed.sessionKey, [...existing, agentId]);
          }
        }

        // Add to event history
        if (parsed.summary) {
          const histItem: EventHistoryItem = {
            timestamp: event.ts,
            agentId,
            agentName: agent.name,
            stream: event.stream,
            summary: parsed.summary,
          };
          state.eventHistory = [histItem, ...state.eventHistory].slice(0, EVENT_HISTORY_LIMIT);
        }
      });
    },

    initEventHistory: async () => {
      // no-op in this phase
    },

    // UI Actions
    selectAgent: (id) => {
      set((state) => {
        state.selectedAgentId = id;
      });
    },

    setConnectionStatus: (status, error) => {
      set((state) => {
        state.connectionStatus = status;
        state.connectionError = error ?? null;
      });
    },

    setSidebarCollapsed: (collapsed) => {
      set((state) => {
        state.sidebarCollapsed = collapsed;
      });
    },

    setSidebarMobileOpen: (open) => {
      set((state) => {
        state.sidebarMobileOpen = open;
      });
    },

    setTheme: (theme) => {
      set((state) => {
        state.theme = theme;
      });
      if (typeof window !== "undefined") {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    },

    setCurrentPage: (page) => {
      set((state) => {
        state.currentPage = page;
      });
    },

    setChatDockHeight: (height) => {
      set((state) => {
        state.chatDockHeight = height;
      });
    },

    // Config
    setMaxSubAgents: (n) => {
      set((state) => {
        state.maxSubAgents = n;
      });
    },

    setAgentToAgentConfig: (config) => {
      set((state) => {
        state.agentToAgentConfig = config;
      });
    },

    setOperatorScopes: (scopes) => {
      set((state) => {
        state.operatorScopes = scopes;
      });
    },

    // Metrics
    pushTokenSnapshot: (snapshot) => {
      set((state) => {
        state.tokenHistory = [...state.tokenHistory, snapshot].slice(-100);
      });
    },

    setAgentCosts: (costs) => {
      set((state) => {
        state.agentCosts = costs;
      });
    },

    updateMetrics: () => {
      set((state) => {
        const agents = [...state.agents.values()];
        const activeStatuses = new Set(["thinking", "tool_calling", "speaking", "spawning"]);
        const activeAgents = agents.filter((a) => activeStatuses.has(a.status)).length;
        const totalAgents = agents.filter((a) => !a.isPlaceholder).length;
        const lastSnapshot = state.tokenHistory[state.tokenHistory.length - 1];
        const totalTokens = lastSnapshot?.total ?? 0;

        state.globalMetrics = {
          ...state.globalMetrics,
          activeAgents,
          totalAgents,
          totalTokens,
        };
      });
    },
  })),
);

// Convenience type alias
export type { OfficeStore };
