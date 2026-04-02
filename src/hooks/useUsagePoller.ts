import { useEffect, useRef, type MutableRefObject } from "react";
import type { GatewayRpcClient } from "@/gateway/rpc-client";
import type { UsageInfo } from "@/gateway/adapter-types";
import { useOfficeStore } from "@/store/office-store";

const POLL_INTERVAL_MS = 30_000;

export function useUsagePoller(
  rpcRef: MutableRefObject<GatewayRpcClient | null>,
): void {
  const connectionStatus = useOfficeStore((s) => s.connectionStatus);
  const pushTokenSnapshot = useOfficeStore((s) => s.pushTokenSnapshot);
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
        const usage = await rpc.request<UsageInfo>("usage.status");
        if (usage?.providers) {
          pushTokenSnapshot({
            timestamp: Date.now(),
            total: 0,
            byAgent: {},
          });
        }
      } catch {
        // silent
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
  }, [connectionStatus, rpcRef, pushTokenSnapshot]);
}
