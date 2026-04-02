import { useEffect, useRef, type MutableRefObject } from "react";
import type { GatewayRpcClient } from "@/gateway/rpc-client";
import type { SessionSnapshot, SubAgentInfo } from "@/gateway/types";
import { useOfficeStore } from "@/store/office-store";

const POLL_INTERVAL_MS = 5_000;

interface SessionsListResult {
  sessions?: Array<{
    key: string;
    agentId?: string;
    label?: string;
    kind?: string;
    task?: string;
    createdAt?: number;
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
          kinds: ["subagent"],
          activeMinutes: 30,
        });
        const sessions: SubAgentInfo[] = (result.sessions ?? []).map((s) => ({
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
