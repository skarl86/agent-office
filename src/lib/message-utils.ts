import type { ToolCallInfo } from "@/gateway/adapter-types";

export function generateMessageId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `msg-${ts}-${rand}`;
}

export function formatMessageTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function mergeDelta(existingContent: string, deltaText: string): string {
  if (!deltaText) return existingContent;
  return existingContent + deltaText;
}

export function updateToolCall(
  toolCalls: ToolCallInfo[],
  toolCallId: string,
  patch: Partial<ToolCallInfo>,
): ToolCallInfo[] {
  const idx = toolCalls.findIndex((tc) => tc.id === toolCallId);
  if (idx >= 0) {
    const updated = [...toolCalls];
    updated[idx] = { ...updated[idx]!, ...patch };
    return updated;
  }
  return [
    ...toolCalls,
    {
      id: toolCallId,
      name: patch.name ?? "unknown",
      status: patch.status ?? "pending",
      args: patch.args,
      result: patch.result,
    },
  ];
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "…";
}
