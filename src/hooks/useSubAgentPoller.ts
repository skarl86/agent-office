import { useEffect, useRef, type MutableRefObject } from "react";
import type { GatewayRpcClient } from "@/gateway/rpc-client";
import type { SessionSnapshot, SubAgentInfo } from "@/gateway/types";
import { useOfficeStore } from "@/store/office-store";
import { extractAgentIdFromSessionKey } from "@/lib/session-key-utils";

const POLL_INTERVAL_MS = 5_000;

interface SessionsListResult {
  sessions?: Array<{
    key: string;
    agentId?: string;
    label?: string;
    kind?: string;
    task?: string;
    createdAt?: number;
    model?: string | null;
  }>;
}

export function useSubAgentPoller(
  rpcRef: MutableRefObject<GatewayRpcClient | null>,
): void {
  const connectionStatus = useOfficeStore((s) => s.connectionStatus);
  const setSessionsSnapshot = useOfficeStore((s) => s.setSessionsSnapshot);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (connectionStatus !== "connected") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const poll = async () => {
      const rpc = rpcRef.current;
      if (!rpc) return;
      try {
        const result = await rpc.request<SessionsListResult>("sessions.list", {
          activeMinutes: 30,
        });

        // 서브에이전트 폴링 — 기존 로직 유지
        const subagentSessions = (result.sessions ?? []).filter(
          (s) => s.kind === "subagent",
        );
        const sessions: SubAgentInfo[] = subagentSessions.map((s) => ({
          sessionKey: s.key,
          agentId: s.agentId ?? "",
          label: s.label ?? "",
          task: s.task ?? "",
          requesterSessionKey: "",
          startedAt: s.createdAt ?? Date.now(),
        }));
        const snapshot: SessionSnapshot = {
          sessions,
          fetchedAt: Date.now(),
        };
        setSessionsSnapshot(snapshot);

        // 모든 세션의 model 정보를 에이전트에 매핑
        const store = useOfficeStore.getState();
        for (const session of result.sessions ?? []) {
          if (session.model) {
            const agentId = extractAgentIdFromSessionKey(session.key);
            if (agentId && store.agents.has(agentId)) {
              store.updateAgent(agentId, { model: session.model });
            }
          }
        }
      } catch {
        // polling failure — silent
      }
    };

    void poll();
    timerRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [connectionStatus, rpcRef, setSessionsSnapshot]);
}
