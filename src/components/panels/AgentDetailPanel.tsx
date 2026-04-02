import { useTranslation } from "react-i18next";
import { X, Wrench, Bot } from "lucide-react";
import { useOfficeStore } from "@/store/office-store";
import { STATUS_COLORS } from "@/lib/constants";
import { generateSvgAvatar } from "@/lib/avatar-generator";
import type { VisualAgent } from "@/gateway/types";

interface AgentDetailPanelProps {
  agentId: string;
  onClose: () => void;
}

export function AgentDetailPanel({ agentId, onClose }: AgentDetailPanelProps) {
  const { t } = useTranslation(["panels", "common"]);
  const agents = useOfficeStore((s) => s.agents);
  const eventHistory = useOfficeStore((s) => s.eventHistory);

  const agent = agents.get(agentId);
  if (!agent) return null;

  const agentEvents = eventHistory.filter((e) => e.agentId === agentId).slice(0, 15);

  return (
    <div className="flex h-full w-72 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          {t("panels:agentDetail.title", "에이전트 상세")}
        </h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
          aria-label="닫기"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Agent identity */}
        <AgentIdentitySection agent={agent} />

        {/* Basic info */}
        <AgentInfoSection agent={agent} />

        {/* Current tool */}
        {agent.currentTool && (
          <div className="rounded bg-orange-50 px-3 py-2 text-xs dark:bg-orange-950/30">
            <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
              <Wrench size={12} />
              <span className="font-medium">{agent.currentTool.name}</span>
            </div>
          </div>
        )}

        {/* Event history */}
        {agentEvents.length > 0 && (
          <EventHistorySection events={agentEvents} />
        )}
      </div>
    </div>
  );
}

function AgentIdentitySection({ agent }: { agent: VisualAgent }) {
  const { t } = useTranslation("common");
  const avatar = generateSvgAvatar(agent.id);
  const statusColor = STATUS_COLORS[agent.status];

  return (
    <div className="flex items-center gap-3">
      {/* Mini avatar */}
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold"
        style={{ backgroundColor: avatar.shirtColor }}
      >
        <Bot size={18} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-[var(--color-text)]">{agent.name}</div>
        <div className="flex items-center gap-1 mt-0.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-xs text-[var(--color-text-secondary)]">
            {t(`agent.statusLabels.${agent.status}` as const)}
          </span>
        </div>
      </div>
    </div>
  );
}

function AgentInfoSection({ agent }: { agent: VisualAgent }) {
  const { t } = useTranslation("panels");
  const rows: { label: string; value: string }[] = [
    { label: "ID", value: agent.id.slice(0, 12) + "…" },
    { label: t("agentDetail.zone", { defaultValue: "구역" }), value: agent.zone },
    {
      label: t("agentDetail.toolCalls", { defaultValue: "도구 호출" }),
      value: String(agent.toolCallCount),
    },
    ...(agent.isSubAgent && agent.parentAgentId
      ? [{ label: t("agentDetail.parent", { defaultValue: "상위" }), value: agent.parentAgentId.slice(0, 8) + "…" }]
      : []),
  ];

  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-xs">
          <span className="text-[var(--color-text-secondary)]">{row.label}</span>
          <span className="font-mono text-[var(--color-text)] truncate max-w-[140px]">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function EventHistorySection({
  events,
}: {
  events: Array<{ timestamp: number; summary: string; stream: string }>;
}) {
  const { t } = useTranslation("panels");

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
        {t("agentDetail.eventHistory", "이벤트 히스토리")}
      </h4>
      <div className="space-y-1">
        {events.map((evt, i) => (
          <div
            key={`${evt.timestamp}-${i}`}
            className="flex items-start gap-2 text-xs"
          >
            <span className="shrink-0 text-[var(--color-text-secondary)] font-mono tabular-nums">
              {new Date(evt.timestamp).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>
            <span className="text-[var(--color-text)] leading-relaxed line-clamp-2">
              {evt.summary}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
