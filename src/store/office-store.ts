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
import { allocatePosition, allocateMeetingPositions } from "@/lib/position-allocator";
import { extractAgentIdFromSessionKey, isSubAgentSessionKey } from "@/lib/session-key-utils";
import { DEFAULT_MAX_SUB_AGENTS, A2A_TOOL_NAMES, ZONES } from "@/lib/constants";

enableMapSet();

const THEME_STORAGE_KEY = "openclaw-theme";
const EVENT_HISTORY_LIMIT = 200;

/** 서브에이전트 퇴장 타이머 (store 외부) */
const subAgentRetireTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

/** A2A 도구 호출에서 target agentId 추출 */
function extractTargetAgentId(
  args: Record<string, unknown> | undefined,
  agents: Map<string, VisualAgent>,
): string | null {
  if (!args) return null;

  // 직접 agentId
  if (typeof args.agentId === "string" && agents.has(args.agentId)) {
    return args.agentId;
  }

  // target (세션키 또는 agentId)
  if (typeof args.target === "string") {
    const target = args.target;
    if (agents.has(target)) return target;
    const extracted = extractAgentIdFromSessionKey(target);
    if (extracted && agents.has(extracted)) return extracted;
  }

  return null;
}

/** 미팅 존 기준 시트 위치 계산 */
const MEETING_CENTER = {
  x: ZONES.meeting.x + ZONES.meeting.width / 2,
  y: ZONES.meeting.y + ZONES.meeting.height / 2,
};

const LOUNGE_CENTER = {
  x: ZONES.lounge.x + ZONES.lounge.width / 2,
  y: ZONES.lounge.y + ZONES.lounge.height / 2,
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
        const displayName = info.label && info.label !== info.agentId
          ? info.label
          : `Sub Agent ${info.agentId.slice(-6)}`;
        const agent = createVisualAgent(info.agentId, displayName, true, state.agents);
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
          const displayName = session.label && session.label !== session.agentId
            ? session.label
            : `Sub Agent ${session.agentId.slice(-6)}`;
          const agent = createVisualAgent(session.agentId, displayName, true, state.agents);
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
      // 퇴장 처리할 서브에이전트 ID (set() 외부에서 타이머 설정)
      let retiredSubAgentId: string | null = null;

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
            const agentIdData = event.data.agentId as string | undefined;
            const labelData = event.data.label as string | undefined;
            const subName =
              (agentIdData && agentIdData !== subId ? agentIdData : null) ??
              labelData ??
              `Sub Agent ${subId.slice(-6)}`;
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

        // ── 서브에이전트 lifecycle end 감지 → 퇴장 처리 ──
        if (
          agent.isSubAgent &&
          parsed.status === "idle" &&
          parsed.clearTool &&
          parsed.clearSpeech
        ) {
          // 이미 pendingRetire면 중복 처리 안 함
          if (!agent.pendingRetire) {
            agent.pendingRetire = true;
            // 라운지로 이동 (퇴장 시각 피드백)
            agent.zone = "lounge";
            agent.position = { ...LOUNGE_CENTER };
            retiredSubAgentId = agentId;
          }
        }

        // ── A2A 도구 호출 감지 → MEETING ROOM 이동 ──
        if (
          event.stream === "tool" &&
          event.data.phase === "start" &&
          !agent.isSubAgent
        ) {
          const toolName = event.data.name as string | undefined;
          if (toolName && A2A_TOOL_NAMES.has(toolName)) {
            const args = event.data.args as Record<string, unknown> | undefined;
            const targetId = extractTargetAgentId(args, state.agents);

            if (targetId) {
              const targetAgent = state.agents.get(targetId);
              if (targetAgent && !targetAgent.isSubAgent) {
                // 링크 추가 or 업데이트 (중복 방지)
                const existingLinkIdx = state.links.findIndex(
                  (l) =>
                    (l.sourceId === agentId && l.targetId === targetId) ||
                    (l.sourceId === targetId && l.targetId === agentId),
                );

                if (existingLinkIdx === -1) {
                  state.links.push({
                    sourceId: agentId,
                    targetId,
                    sessionKey: event.sessionKey ?? `${agentId}-${targetId}`,
                    strength: 0.8,
                    lastActivityAt: Date.now(),
                    isPeer: true,
                  });
                } else {
                  const link = state.links[existingLinkIdx];
                  if (link) {
                    link.strength = Math.min(1.0, link.strength + 0.1);
                    link.lastActivityAt = Date.now();
                  }
                }

                // 두 에이전트를 미팅 존으로 이동
                const seats = allocateMeetingPositions(
                  [agentId, targetId],
                  MEETING_CENTER,
                  80,
                );

                if (agent.zone !== "meeting") {
                  agent.zone = "meeting";
                  if (seats[0]) agent.position = seats[0];
                  if (!agent.arrivedAtMeetingAt) agent.arrivedAtMeetingAt = Date.now();
                }

                if (targetAgent.zone !== "meeting") {
                  targetAgent.zone = "meeting";
                  if (seats[1]) targetAgent.position = seats[1];
                  if (!targetAgent.arrivedAtMeetingAt)
                    targetAgent.arrivedAtMeetingAt = Date.now();
                }
              }
            }
          }
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

      // ── 서브에이전트 퇴장 타이머 (store 외부) ──
      if (retiredSubAgentId) {
        const retiring = retiredSubAgentId;
        const existing = subAgentRetireTimers.get(retiring);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          subAgentRetireTimers.delete(retiring);
          get().removeSubAgent(retiring);
        }, 30000);
        subAgentRetireTimers.set(retiring, timer);
      }
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
