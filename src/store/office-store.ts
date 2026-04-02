import { enableMapSet } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { parseAgentEvent } from "@/gateway/event-parser";
import type {
  AgentEventPayload,
  AgentSummary,
  AgentToAgentConfig,
  AgentZone,
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
import { extractAgentIdFromSessionKey, extractSessionNamespace, isSubAgentSessionKey } from "@/lib/session-key-utils";
import { DEFAULT_MAX_SUB_AGENTS, A2A_TOOL_NAMES, ZONES } from "@/lib/constants";
import { calculatePath, calculateDuration, interpolatePath } from "@/lib/pathfinding";
import { applyMeetingGathering, detectMeetingGroups } from "./meeting-manager";

enableMapSet();

const THEME_STORAGE_KEY = "openclaw-theme";
const EVENT_HISTORY_LIMIT = 200;
const LINK_TIMEOUT_MS = 60_000;

/** 서브에이전트 퇴장 타이머 (store 외부) */
const subAgentRetireTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 미팅 복귀 타이머 (store 외부) */
const meetingRetireTimers = new Map<string, ReturnType<typeof setTimeout>>();
const MIN_MEETING_STAY_MS = 10_000;

let meetingGatheringTimer: ReturnType<typeof setTimeout> | null = null;
let lastMeetingGroupsHash = "";
const MEETING_GATHERING_THROTTLE_MS = 500;

const LOUNGE_CENTER = {
  x: ZONES.lounge.x + ZONES.lounge.width / 2,
  y: ZONES.lounge.y + ZONES.lounge.height / 2,
};

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
    originalZone: null,
    movement: null,
    confirmed: true,
    arrivedAtHotDeskAt: isSubAgent ? Date.now() : null,
    pendingRetire: false,
    arrivedAtMeetingAt: null,
    manualMeeting: false,
    model: null,
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

  // sessionKey에서 에이전트 추출 (sessions_send에서 sessionKey로 대상 지정)
  if (typeof args.sessionKey === "string") {
    const extracted = extractAgentIdFromSessionKey(args.sessionKey);
    if (extracted) {
      // id로 직접 매칭
      if (agents.has(extracted)) return extracted;
      // name으로 매칭
      for (const [id, a] of agents) {
        if (!a.isSubAgent && (a.id === extracted || a.name === extracted)) {
          return id;
        }
      }
    }
  }

  return null;
}

/**
 * Create a direct peer collaboration link between two main agents.
 * Used when an A2A tool event (sessions_send, sessions_spawn, etc.) is detected.
 * These links bypass sessionKey matching since peer agents use different session keys.
 */
function createPeerCollaborationLink(
  state: { links: CollaborationLink[]; agents: Map<string, VisualAgent> },
  sourceId: string,
  targetId: string,
): void {
  if (sourceId === targetId) return;
  const source = state.agents.get(sourceId);
  const target = state.agents.get(targetId);
  if (!source || !target) return;
  // Only link main agents (not sub-agents) for meeting zone
  if (source.isSubAgent || target.isSubAgent) return;

  const peerSessionKey = `peer:${[sourceId, targetId].sort().join(":")}`;
  const now = Date.now();

  const existingIdx = state.links.findIndex(
    (l) =>
      (l.sourceId === sourceId && l.targetId === targetId) ||
      (l.sourceId === targetId && l.targetId === sourceId),
  );

  if (existingIdx >= 0) {
    const link = state.links[existingIdx];
    if (link) {
      link.lastActivityAt = now;
      link.strength = Math.min(link.strength + 0.15, 1);
      link.isPeer = true;
    }
  } else {
    state.links.push({
      sourceId,
      targetId,
      sessionKey: peerSessionKey,
      strength: 0.5, // Start above threshold immediately
      lastActivityAt: now,
      isPeer: true,
    });
  }
}

/**
 * sessionKey 기반 collaboration link 업데이트.
 * 같은 sessionKey에 2+ 에이전트가 매핑되면 링크 생성.
 * namespace 기반 매칭도 수행 — 다른 sessionKey라도 같은 agent namespace면 링크 생성.
 */
function updateCollaborationLinks(
  state: { links: CollaborationLink[]; sessionKeyMap: Map<string, string[]> },
  sessionKey: string,
  agentId: string,
): void {
  const agents = state.sessionKeyMap.get(sessionKey);
  if (!agents || agents.length < 2) {
    // namespace 기반 매칭 시도
    const ns = extractSessionNamespace(sessionKey);
    if (ns) {
      const nsAgents = new Set<string>();
      for (const [sk, ids] of state.sessionKeyMap) {
        if (extractSessionNamespace(sk) === ns && !sk.includes(":subagent:")) {
          for (const id of ids) nsAgents.add(id);
        }
      }
      if (nsAgents.size >= 2) {
        const nsAgentList = Array.from(nsAgents);
        const now = Date.now();
        for (let i = 0; i < nsAgentList.length; i++) {
          for (let j = i + 1; j < nsAgentList.length; j++) {
            const a = nsAgentList[i]!;
            const b = nsAgentList[j]!;
            const existingIdx = state.links.findIndex(
              (l) =>
                l.sessionKey === sessionKey &&
                ((l.sourceId === a && l.targetId === b) || (l.sourceId === b && l.targetId === a)),
            );
            if (existingIdx >= 0) {
              const link = state.links[existingIdx];
              if (link) {
                link.lastActivityAt = now;
                link.strength = Math.min(link.strength + 0.1, 1);
              }
            } else {
              state.links.push({
                sourceId: a,
                targetId: b,
                sessionKey,
                strength: 0.3,
                lastActivityAt: now,
              });
            }
          }
        }
        state.links = state.links.filter((l) => now - l.lastActivityAt < LINK_TIMEOUT_MS);
      }
    }
    return;
  }

  const now = Date.now();
  for (const otherId of agents) {
    if (otherId === agentId) continue;

    const existingIdx = state.links.findIndex(
      (l) =>
        l.sessionKey === sessionKey &&
        ((l.sourceId === agentId && l.targetId === otherId) ||
          (l.sourceId === otherId && l.targetId === agentId)),
    );

    if (existingIdx >= 0) {
      const link = state.links[existingIdx];
      if (link) {
        link.lastActivityAt = now;
        link.strength = Math.min(link.strength + 0.1, 1);
      }
    } else {
      state.links.push({
        sourceId: agentId,
        targetId: otherId,
        sessionKey,
        strength: 0.3,
        lastActivityAt: now,
      });
    }
  }

  // stale 링크 제거
  state.links = state.links.filter((l) => now - l.lastActivityAt < LINK_TIMEOUT_MS);
}

/**
 * Schedule meeting gathering with 500ms throttle.
 * detectMeetingGroups → applyMeetingGathering chain.
 * lastMeetingGroupsHash prevents duplicate processing.
 */
function scheduleMeetingGathering(): void {
  if (meetingGatheringTimer) return;
  meetingGatheringTimer = setTimeout(() => {
    meetingGatheringTimer = null;
    const state = useOfficeStore.getState();

    const allowList = state.agentToAgentConfig.enabled
      ? state.agentToAgentConfig.allow
      : undefined;
    const groups = detectMeetingGroups(state.links, state.agents, allowList);
    const hash = JSON.stringify(groups.map((g) => g.agentIds.sort()));
    if (hash === lastMeetingGroupsHash) return;
    lastMeetingGroupsHash = hash;

    applyMeetingGathering(
      state.agents,
      groups,
      (id, pos) => useOfficeStore.getState().moveToMeeting(id, pos),
      (id) => useOfficeStore.getState().returnFromMeeting(id),
      (id) => scheduleMeetingReturn(id),
    );
  }, MEETING_GATHERING_THROTTLE_MS);
}

/**
 * Schedule a meeting return for a main agent, enforcing the minimum 10s stay.
 *
 * Possible states:
 * - Still walking TO meeting → record intent, re-invoke once arrived
 * - At meeting, arrived recently → schedule timer for remaining wait
 * - At meeting, stayed long enough → return immediately
 */
function scheduleMeetingReturn(agentId: string): void {
  // Cancel any existing timer
  const existingTimer = meetingRetireTimers.get(agentId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    meetingRetireTimers.delete(agentId);
  }

  const agent = useOfficeStore.getState().agents.get(agentId);
  if (!agent) return;
  // Don't return agents that are already leaving or gone
  if (agent.zone !== "meeting" && agent.movement?.toZone !== "meeting") return;
  // Skip manual meeting agents
  if (agent.manualMeeting) return;

  // Still walking to meeting — schedule a follow-up check after expected arrival + min stay
  if (agent.movement?.toZone === "meeting") {
    const remaining = agent.movement.duration * (1 - agent.movement.progress) + MIN_MEETING_STAY_MS;
    const timer = setTimeout(() => {
      meetingRetireTimers.delete(agentId);
      scheduleMeetingReturn(agentId);
    }, remaining);
    meetingRetireTimers.set(agentId, timer);
    return;
  }

  // At meeting — check minimum stay
  if (agent.zone === "meeting") {
    const arrived = agent.arrivedAtMeetingAt ?? Date.now();
    const elapsed = Date.now() - arrived;
    const remaining = MIN_MEETING_STAY_MS - elapsed;

    if (remaining > 0) {
      const timer = setTimeout(() => {
        meetingRetireTimers.delete(agentId);
        scheduleMeetingReturn(agentId);
      }, remaining);
      meetingRetireTimers.set(agentId, timer);
      return;
    }

    // Min stay satisfied → return to original zone
    useOfficeStore.getState().returnFromMeeting(agentId);
  }
}

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

    // ── Movement ──

    startMovement: (agentId: string, toZone: AgentZone, targetPos?: { x: number; y: number }) => {
      set((state) => {
        const agent = state.agents.get(agentId);
        if (!agent) return;
        // Don't start if already walking to the same zone
        if (agent.movement && agent.movement.toZone === toZone) return;

        const fromZone = agent.zone;
        const to = targetPos ?? agent.position; // fallback to current pos if no target
        const path = calculatePath(agent.position, fromZone, to, toZone);
        const duration = calculateDuration(path);

        agent.movement = {
          path,
          progress: 0,
          duration,
          startTime: Date.now(),
          fromZone,
          toZone,
        };
      });
    },

    moveToMeeting: (agentId: string, meetingPosition: { x: number; y: number }) => {
      set((state) => {
        const agent = state.agents.get(agentId);
        if (agent) {
          if (!agent.originalPosition) {
            agent.originalPosition = { ...agent.position };
            agent.originalZone = agent.zone;
          }
        }
      });
      // Trigger walk animation to meeting position
      useOfficeStore.getState().startMovement(agentId, "meeting", meetingPosition);
    },

    returnFromMeeting: (agentId: string) => {
      // Cancel any pending meeting return timer
      const pendingTimer = meetingRetireTimers.get(agentId);
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        meetingRetireTimers.delete(agentId);
      }
      const agent = useOfficeStore.getState().agents.get(agentId);
      if (!agent?.originalPosition || !agent?.originalZone) return;
      const returnZone = agent.originalZone;
      const returnPos = { ...agent.originalPosition };
      set((state) => {
        const a = state.agents.get(agentId);
        if (a) {
          a.originalPosition = null;
          a.originalZone = null;
          a.arrivedAtMeetingAt = null;
          a.manualMeeting = false;
        }
      });
      useOfficeStore.getState().startMovement(agentId, returnZone, returnPos);
    },

    tickMovement: () => {
      set((state) => {
        const now = Date.now();
        for (const agent of state.agents.values()) {
          if (!agent.movement) continue;

          const elapsed = now - agent.movement.startTime;
          const progress = Math.min(1, elapsed / agent.movement.duration);
          agent.movement.progress = progress;

          const pos = interpolatePath(agent.movement.path, progress);
          agent.position = pos;

          if (progress >= 1) {
            // 도착
            agent.zone = agent.movement.toZone;
            agent.position = agent.movement.path[agent.movement.path.length - 1]!;
            if (agent.movement.toZone === "meeting") {
              agent.arrivedAtMeetingAt = now;
            }
            agent.movement = null;
          }
        }
      });
    },

    // ── Agent CRUD ──

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
      // DEBUG: 이벤트 로깅
      if (import.meta.env.DEV) {
        console.log("[AgentEvent]", event.stream, event.data.phase ?? "", event.data.name ?? "", "session:", event.sessionKey, "runId:", event.runId);
      }
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

        // ── A2A 도구 호출 감지 → createPeerCollaborationLink + scheduleMeetingGathering ──
        if (
          event.stream === "tool" &&
          event.data.phase === "start" &&
          !agent.isSubAgent
        ) {
          const toolName = event.data.name as string | undefined;
          if (toolName && A2A_TOOL_NAMES.has(toolName)) {
            const args = (event.data.args ?? event.data.input) as Record<string, unknown> | undefined;
            const targetId = extractTargetAgentId(args, state.agents);

            if (targetId) {
              const targetAgent = state.agents.get(targetId);
              if (targetAgent && !targetAgent.isSubAgent) {
                createPeerCollaborationLink(state, agentId, targetId);
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

        // sessionKey 기반 collaboration link 업데이트 (경로 1: Gateway 수정 없이 동작)
        if (event.sessionKey && agentId) {
          updateCollaborationLinks(state, event.sessionKey, agentId);
        }

        // Update runIdMap
        state.runIdMap.set(event.runId, agentId);

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

      // Post-set: schedule meeting gathering after A2A tool detection
      scheduleMeetingGathering();

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

    // ── UI Actions ──

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

    // ── Config ──

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

    // ── Metrics ──

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
