import { useEffect, useRef } from "react";
import { initAdapter, isMockMode } from "@/gateway/adapter-provider";
import { GatewayRpcClient } from "@/gateway/rpc-client";
import type {
  AgentEventPayload,
  AgentSummary,
  AgentsListResponse,
  GatewayEventFrame,
  HealthSnapshot,
} from "@/gateway/types";
import { GatewayWsClient } from "@/gateway/ws-client";
import { EventThrottle } from "@/lib/event-throttle";
import { useOfficeStore } from "@/store/office-store";

interface UseGatewayConnectionOptions {
  url: string;
  token: string;
}

export function useGatewayConnection({ url, token }: UseGatewayConnectionOptions) {
  const wsRef = useRef<GatewayWsClient | null>(null);
  const rpcRef = useRef<GatewayRpcClient | null>(null);
  const throttleRef = useRef<EventThrottle | null>(null);

  const setConnectionStatus = useOfficeStore((s) => s.setConnectionStatus);
  const initAgents = useOfficeStore((s) => s.initAgents);
  const syncMainAgents = useOfficeStore((s) => s.syncMainAgents);
  const processAgentEvent = useOfficeStore((s) => s.processAgentEvent);
  const setOperatorScopes = useOfficeStore((s) => s.setOperatorScopes);
  const setMaxSubAgents = useOfficeStore((s) => s.setMaxSubAgents);
  const setAgentToAgentConfig = useOfficeStore((s) => s.setAgentToAgentConfig);

  useEffect(() => {
    if (!url) return;

    if (isMockMode()) {
      let unsubEvent: (() => void) | null = null;

      void initAdapter("mock").then(async (adapter) => {
        unsubEvent = adapter.onEvent((event: string, payload: unknown) => {
          if (event === "agent") {
            processAgentEvent(payload as AgentEventPayload);
          }
        });

        const config = await adapter.configGet();
        const cfg = config.config as Record<string, unknown>;
        const agentsCfg = cfg.agents as Record<string, unknown> | undefined;
        const defaults = agentsCfg?.defaults as Record<string, unknown> | undefined;
        const subagents = defaults?.subagents as { maxConcurrent?: number } | undefined;
        if (subagents?.maxConcurrent) {
          setMaxSubAgents(subagents.maxConcurrent);
        }
        const tools = cfg.tools as Record<string, unknown> | undefined;
        const a2a = tools?.agentToAgent as { enabled?: boolean; allow?: string[] } | undefined;
        if (a2a) {
          setAgentToAgentConfig({
            enabled: a2a.enabled ?? false,
            allow: Array.isArray(a2a.allow) ? a2a.allow : [],
          });
        }

        const agentList = await adapter.agentsList();
        initAgents(agentList.agents);
        setOperatorScopes(["operator.admin", "operator.read"]);
        setConnectionStatus("connected");
      });

      return () => {
        unsubEvent?.();
      };
    }

    const ws = new GatewayWsClient();
    const rpc = new GatewayRpcClient(ws);
    const throttle = new EventThrottle();

    wsRef.current = ws;
    rpcRef.current = rpc;
    throttleRef.current = throttle;

    throttle.onBatch((events) => {
      for (const event of events) {
        processAgentEvent(event);
      }
    });

    throttle.onImmediate((event) => {
      processAgentEvent(event);
    });

    ws.onStatusChange((status, error) => {
      setConnectionStatus(status, error);

      if (status === "connected") {
        const snapshot = ws.getSnapshot();
        const health = snapshot?.health as HealthSnapshot | undefined;
        if (health?.agents) {
          const summaries: AgentSummary[] = health.agents.map((a) => ({
            id: a.agentId,
            name: a.agentId,
          }));
          initAgents(summaries);
        }

        const authScopes = ws.getAuthInfo()?.scopes;
        setOperatorScopes(Array.isArray(authScopes) ? authScopes : ["operator.admin", "operator.read"]);

        void initAdapter("ws", { wsClient: ws, rpcClient: rpc });
        void fetchGatewayConfig(rpc, setMaxSubAgents, setAgentToAgentConfig);
        void fetchAgentNames(rpc, syncMainAgents);

        // session.tool 이벤트를 받기 위해 sessions.subscribe 호출
        void rpc.request("sessions.subscribe").catch(() => {});

      }
    });

    ws.onEvent("agent", (frame: GatewayEventFrame) => {
      const payload = frame.payload as AgentEventPayload;
      if (import.meta.env.DEV) {
        console.log("[WS:agent]", payload.stream, payload.data?.phase ?? "", payload.data?.name ?? "", "session:", payload.sessionKey);
      }
      throttle.push(payload);
    });

    // session.tool 이벤트 — sessions.subscribe 후 모든 세션의 tool 이벤트 수신
    ws.onEvent("session.tool", (frame: GatewayEventFrame) => {
      const payload = frame.payload as AgentEventPayload;
      if (import.meta.env.DEV) {
        console.log("[WS:session.tool]", payload.data?.name ?? "", "session:", payload.sessionKey);
      }
      // tool 이벤트를 agent 이벤트와 동일하게 처리 (A2A 도구 감지 포함)
      throttle.push(payload);
    });

    ws.onEvent("health", (frame: GatewayEventFrame) => {
      const health = frame.payload as HealthSnapshot;
      if (health?.agents) {
        const summaries: AgentSummary[] = health.agents.map((a) => ({
          id: a.agentId,
          name: a.agentId,
        }));
        syncMainAgents(summaries);
      }
    });

    ws.connect(url, token);

    return () => {
      throttle.destroy();
      ws.disconnect();
      wsRef.current = null;
      rpcRef.current = null;
      throttleRef.current = null;
    };
  }, [
    url,
    token,
    setConnectionStatus,
    initAgents,
    syncMainAgents,
    processAgentEvent,
    setOperatorScopes,
    setMaxSubAgents,
    setAgentToAgentConfig,
  ]);

  return { wsClient: wsRef, rpcClient: rpcRef };
}

async function fetchAgentNames(
  rpc: GatewayRpcClient,
  syncMainAgents: (agents: AgentSummary[]) => void,
): Promise<void> {
  try {
    const result = await rpc.request<AgentsListResponse>("agents.list");
    if (result?.agents) {
      syncMainAgents(result.agents);
    }
  } catch {
    // agents.list not available yet
  }
}

async function fetchGatewayConfig(
  rpc: GatewayRpcClient,
  setMaxSubAgents: (n: number) => void,
  setAgentToAgentConfig: (config: { enabled: boolean; allow: string[] }) => void,
): Promise<void> {
  try {
    const resp = await rpc.request<Record<string, unknown>>("config.get");
    // config.get returns full config snapshot: { config: { agents: {...}, tools: {...}, ... } }
    const cfg = (resp.config ?? resp) as Record<string, unknown>;
    const agentsCfg = cfg.agents as Record<string, unknown> | undefined;
    const defaults = agentsCfg?.defaults as Record<string, unknown> | undefined;
    const toolsCfg = cfg.tools as Record<string, unknown> | undefined;

    const subagents = defaults?.subagents as { maxConcurrent?: number } | undefined;
    if (subagents?.maxConcurrent && subagents.maxConcurrent >= 1 && subagents.maxConcurrent <= 50) {
      setMaxSubAgents(subagents.maxConcurrent);
    }

    const a2a = toolsCfg?.agentToAgent as { enabled?: boolean; allow?: string[] } | undefined;
    if (a2a) {
      setAgentToAgentConfig({
        enabled: a2a.enabled ?? false,
        allow: Array.isArray(a2a.allow) ? a2a.allow : [],
      });
    }

    // 에이전트별 기본 모델 매핑 (config 기반)
    const defaultModel = defaults?.model as { primary?: string } | string | undefined;
    const defaultModelStr = typeof defaultModel === "string"
      ? defaultModel
      : typeof defaultModel === "object" && defaultModel?.primary
        ? defaultModel.primary
        : null;

    const agentList = agentsCfg?.list as Array<{ id: string; model?: { primary?: string } | string }> | undefined;
    if (agentList) {
      const store = useOfficeStore.getState();
      for (const entry of agentList) {
        if (!entry.id || !store.agents.has(entry.id)) continue;
        const agent = store.agents.get(entry.id);
        if (agent?.model) continue; // 세션 폴링에서 이미 설정된 경우 우선

        const agentModel = typeof entry.model === "string"
          ? entry.model
          : typeof entry.model === "object" && entry.model?.primary
            ? entry.model.primary
            : defaultModelStr;

        if (agentModel) {
          store.updateAgent(entry.id, { model: agentModel });
        }
      }
    }
  } catch {
    // config.get not available
  }
}
