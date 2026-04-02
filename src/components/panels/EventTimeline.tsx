import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentStream } from "@/gateway/types";
import { STATUS_COLORS } from "@/lib/constants";
import { useOfficeStore } from "@/store/office-store";

const STREAM_ICONS: Partial<Record<AgentStream, string>> = {
  lifecycle: "●",
  tool: "🔧",
  assistant: "💬",
  error: "⚠",
};

const MAX_DISPLAY = 50;

export function EventTimeline() {
  const { t } = useTranslation(["panels", "common"]);
  const eventHistory = useOfficeStore((s) => s.eventHistory);
  const selectAgent = useOfficeStore((s) => s.selectAgent);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevLenRef = useRef(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const displayEvents = eventHistory.slice(-MAX_DISPLAY);

  useEffect(() => {
    if (autoScroll && scrollRef.current && eventHistory.length > prevLenRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevLenRef.current = eventHistory.length;
  }, [eventHistory.length, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    setAutoScroll(atBottom);
  }, []);

  const handleRowClick = useCallback(
    (index: number, agentId: string) => {
      if (expandedIndex === index) {
        setExpandedIndex(null);
      } else {
        setExpandedIndex(index);
        selectAgent(agentId);
      }
    },
    [expandedIndex, selectAgent],
  );

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      {!autoScroll && eventHistory.length > 0 && (
        <div className="sticky top-0 z-10 flex justify-end bg-[var(--color-surface)]/80 px-2 py-0.5 backdrop-blur-sm">
          <button
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
            }}
            className="rounded bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] text-white"
          >
            {t("panels:eventTimeline.newEvents", "새 이벤트")}
          </button>
        </div>
      )}

      {displayEvents.map((evt, i) => {
        const isExpanded = expandedIndex === i;
        const icon = STREAM_ICONS[evt.stream] ?? "·";

        return (
          <div key={`${evt.timestamp}-${evt.agentId}-${i}`}>
            <button
              onClick={() => handleRowClick(i, evt.agentId)}
              className={`flex w-full items-start gap-1.5 border-b border-[var(--color-border)] px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-border)]/30 ${
                isExpanded ? "bg-[var(--color-accent)]/5" : ""
              }`}
            >
              <span className="mt-0.5 shrink-0 text-[var(--color-text-secondary)] font-mono tabular-nums">
                {new Date(evt.timestamp).toLocaleTimeString("ko-KR", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="shrink-0">{icon}</span>
              <span
                className="shrink-0 font-medium"
                style={{
                  color: STATUS_COLORS[evt.stream === "error" ? "error" : "thinking"],
                }}
              >
                {evt.agentName}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">
                {evt.summary}
              </span>
              <span className="shrink-0 text-[10px] text-[var(--color-text-secondary)]/40">
                {isExpanded ? "▼" : "▶"}
              </span>
            </button>

            {isExpanded && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-border)]/10 px-3 py-2">
                <div className="space-y-1 text-[11px]">
                  <DetailRow label="스트림" value={evt.stream} />
                  <DetailRow label="에이전트" value={`${evt.agentName} (${evt.agentId.slice(0, 8)}…)`} />
                  <DetailRow
                    label="시각"
                    value={new Date(evt.timestamp).toLocaleString("ko-KR", { hour12: false })}
                  />
                  <div className="pt-1">
                    <div className="text-[var(--color-text-secondary)]">내용</div>
                    <div className="mt-0.5 whitespace-pre-wrap break-all rounded bg-[var(--color-surface)] p-1.5 text-[var(--color-text)]">
                      {evt.summary || "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {displayEvents.length === 0 && (
        <div className="py-6 text-center text-xs text-[var(--color-text-secondary)]">
          {t("common:empty.noEvents")}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-12 shrink-0 text-[var(--color-text-secondary)]">{label}</span>
      <span className="min-w-0 break-all text-[var(--color-text)]">{value}</span>
    </div>
  );
}
