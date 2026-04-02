/**
 * 세션 키 파싱 유틸리티
 *
 * OpenClaw Gateway sessionKey 형식:
 *   주 에이전트 세션: agent:<agentId>:<type>        예: agent:main:main
 *   서브에이전트 세션: agent:<parentId>:subagent:<uuid>
 */

/**
 * sessionKey의 네임스페이스 추출 (agent:<id> 접두사)
 * 예: "agent:main:subagent:xxx" → "agent:main"
 * 비표준 형식은 null 반환
 */
export function extractSessionNamespace(sessionKey: string): string | null {
  if (!sessionKey.startsWith("agent:")) return null;
  const rest = sessionKey.slice("agent:".length);
  const secondColon = rest.indexOf(":");
  if (secondColon === -1) return null;
  const agentId = rest.slice(0, secondColon);
  if (!agentId) return null;
  return `agent:${agentId}`;
}

/**
 * 서브에이전트 sessionKey 여부 확인
 * Gateway 형식: "agent:<parentId>:subagent:<uuid>"
 */
export function isSubAgentSessionKey(sessionKey: string): boolean {
  return sessionKey.includes(":subagent:");
}

/**
 * 서브에이전트 sessionKey에서 부모 에이전트 네임스페이스 추출
 * 예: "agent:main:subagent:xxx" → "agent:main"
 */
export function extractParentNamespace(sessionKey: string): string | null {
  if (!isSubAgentSessionKey(sessionKey)) return null;
  return extractSessionNamespace(sessionKey);
}

/**
 * sessionKey에서 agentId 부분 추출
 * 예: "agent:main:main" → "main"
 * 예: "agent:main:subagent:uuid" → "main" (부모 에이전트)
 */
export function extractAgentIdFromSessionKey(sessionKey: string): string | null {
  if (!sessionKey.startsWith("agent:")) return null;
  const rest = sessionKey.slice("agent:".length);
  const secondColon = rest.indexOf(":");
  if (secondColon === -1) return rest || null;
  return rest.slice(0, secondColon) || null;
}

/**
 * 서브에이전트 UUID 추출
 * 예: "agent:main:subagent:uuid-xxx" → "uuid-xxx"
 */
export function extractSubAgentUuid(sessionKey: string): string | null {
  const marker = ":subagent:";
  const idx = sessionKey.indexOf(marker);
  if (idx >= 0) return sessionKey.slice(idx + marker.length);
  return null;
}
