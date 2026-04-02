// 어댑터 팩토리 — mock/ws 전환 및 waitForAdapter

import type { GatewayAdapter } from "./adapter";
import { MockAdapter } from "./mock-adapter";
import { GatewayRpcClient } from "./rpc-client";
import { WsAdapter } from "./ws-adapter";
import { GatewayWsClient } from "./ws-client";

let adapterInstance: GatewayAdapter | null = null;
let adapterInitPromise: Promise<GatewayAdapter> | null = null;
let adapterInitError: Error | null = null;
let adapterReadyWaiters: Array<{
  resolve: (adapter: GatewayAdapter) => void;
  reject: (error: Error) => void;
}> = [];

export function getAdapter(): GatewayAdapter {
  if (adapterInstance) return adapterInstance;
  throw new Error("GatewayAdapter가 초기화되지 않았습니다. initAdapter()를 먼저 호출하세요.");
}

/**
 * 어댑터 초기화를 기다립니다 (이미 준비된 경우 즉시 resolve).
 * 콘솔 페이지에서 WebSocket 연결 전에 데이터를 가져올 때의 경쟁 조건을 처리합니다.
 */
export function waitForAdapter(timeoutMs = 15_000): Promise<GatewayAdapter> {
  if (adapterInstance) return Promise.resolve(adapterInstance);
  if (adapterInitError) return Promise.reject(adapterInitError);

  return new Promise<GatewayAdapter>((resolve, reject) => {
    const timer = setTimeout(() => {
      adapterReadyWaiters = adapterReadyWaiters.filter((w) => w.resolve !== wrappedResolve);
      reject(new Error("어댑터 초기화 타임아웃"));
    }, timeoutMs);

    const wrappedResolve = (adapter: GatewayAdapter) => {
      clearTimeout(timer);
      resolve(adapter);
    };
    const wrappedReject = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    adapterReadyWaiters.push({ resolve: wrappedResolve, reject: wrappedReject });
  });
}

export async function initAdapter(
  mode: "mock" | "ws",
  deps?: { wsClient: unknown; rpcClient: unknown },
): Promise<GatewayAdapter> {
  if (adapterInstance) return adapterInstance;
  if (adapterInitPromise) return adapterInitPromise;

  adapterInitError = null;
  const initPromise = (async () => {
    try {
      const adapter =
        mode === "mock" ? new MockAdapter() : createWsAdapter(deps);

      await adapter.connect();
      adapterInstance = adapter;
      resolveWaiters(adapter);
      return adapter;
    } catch (error) {
      const normalized = toError(error);
      adapterInitError = normalized;
      rejectWaiters(normalized);
      throw normalized;
    }
  })();

  adapterInitPromise = initPromise;

  try {
    return await initPromise;
  } finally {
    if (adapterInitPromise === initPromise) {
      adapterInitPromise = null;
    }
  }
}

export function isMockMode(): boolean {
  return import.meta.env.VITE_MOCK === "true";
}

function createWsAdapter(deps?: { wsClient: unknown; rpcClient: unknown }): GatewayAdapter {
  if (!deps) throw new Error("WsAdapter는 wsClient와 rpcClient가 필요합니다");
  if (!(deps.wsClient instanceof GatewayWsClient)) {
    throw new Error("유효하지 않은 wsClient");
  }
  if (!(deps.rpcClient instanceof GatewayRpcClient)) {
    throw new Error("유효하지 않은 rpcClient");
  }
  return new WsAdapter(deps.wsClient, deps.rpcClient);
}

function resolveWaiters(adapter: GatewayAdapter): void {
  for (const w of adapterReadyWaiters) w.resolve(adapter);
  adapterReadyWaiters = [];
}

function rejectWaiters(error: Error): void {
  for (const w of adapterReadyWaiters) w.reject(error);
  adapterReadyWaiters = [];
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function __resetAdapterForTests(): void {
  adapterInstance?.disconnect();
  adapterInstance = null;
  adapterInitPromise = null;
  adapterInitError = null;
  adapterReadyWaiters = [];
}
