import { RefreshCw, Loader2, Clock } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { CronTask } from "@/gateway/adapter-types";
import type { AgentSummary } from "@/gateway/types";
import { useAgentsStore } from "@/store/console-stores/agents-store";

interface CronJobsTabProps {
  agent: AgentSummary;
}

export function CronJobsTab({ agent }: CronJobsTabProps) {
  const { t } = useTranslation("console");
  const {
    agentCronJobs,
    agentCronJobsLoading,
    fetchAgentCronJobs,
    removeAgentCronJob,
    runAgentCronJob,
    toggleAgentCronJob,
  } = useAgentsStore();

  useEffect(() => {
    fetchAgentCronJobs(agent.id);
  }, [agent.id, fetchAgentCronJobs]);

  const tasks = agentCronJobs ?? [];
  const totalCount = tasks.length;
  const enabledCount = tasks.filter((task) => task.enabled).length;
  const errorCount = tasks.filter((task) => task.state.lastRunStatus === "error").length;

  if (agentCronJobsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t("agents.cronJobs.title")}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchAgentCronJobs(agent.id)}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-4">
        <StatChip label={t("agents.cronJobs.total")} value={totalCount} />
        <StatChip label={t("agents.cronJobs.enabled")} value={enabledCount} color="green" />
        <StatChip label={t("agents.cronJobs.errors")} value={errorCount} color="red" />
      </div>

      {tasks.length === 0 ? (
        <div className="py-8 text-center">
          <Clock className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {t("agents.cronJobs.noCronJobs")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <CronTaskRow
              key={task.id}
              task={task}
              onToggle={(id, enabled) => toggleAgentCronJob(id, enabled)}
              onRun={(id) => runAgentCronJob(id)}
              onDelete={(id) => removeAgentCronJob(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CronTaskRow({
  task,
  onToggle,
  onRun,
  onDelete,
}: {
  task: CronTask;
  onToggle: (id: string, enabled: boolean) => void;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("console");
  const statusColor = task.state.lastRunStatus === "error"
    ? "text-red-500"
    : task.state.lastRunStatus === "ok"
      ? "text-green-500"
      : "text-gray-400";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <Clock className={`h-4 w-4 shrink-0 ${statusColor}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{task.name}</p>
        {task.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{task.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggle(task.id, !task.enabled)}
          className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
            task.enabled
              ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400"
          }`}
        >
          {task.enabled ? t("agents.cronJobs.enabled") : t("agents.cronJobs.disabled")}
        </button>
        <button
          onClick={() => onRun(task.id)}
          className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          {t("agents.cronJobs.run")}
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          {t("agents.cronJobs.delete")}
        </button>
      </div>
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color?: "green" | "red" }) {
  const textColor =
    color === "green"
      ? "text-green-600 dark:text-green-400"
      : color === "red"
        ? "text-red-600 dark:text-red-400"
        : "text-gray-900 dark:text-gray-100";
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
      <div className={`text-lg font-semibold ${textColor}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}
