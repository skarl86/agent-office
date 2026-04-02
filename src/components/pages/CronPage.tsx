import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Plus, RefreshCw } from "lucide-react";
import { useCronStore } from "@/store/console-stores/cron-store";
import { useOfficeStore } from "@/store/office-store";
import { CronTaskCard } from "@/components/console/cron/CronTaskCard";
import { CronStatsBar } from "@/components/console/cron/CronStatsBar";
import { LoadingState } from "@/components/console/shared/LoadingState";
import { EmptyState } from "@/components/console/shared/EmptyState";
import type { CronTask } from "@/gateway/adapter-types";

export function CronPage() {
  const { t } = useTranslation("console");
  const tasks = useCronStore((s) => s.tasks);
  const isLoading = useCronStore((s) => s.isLoading);
  const error = useCronStore((s) => s.error);
  const fetchTasks = useCronStore((s) => s.fetchTasks);
  const removeTask = useCronStore((s) => s.removeTask);
  const runTask = useCronStore((s) => s.runTask);
  const updateTask = useCronStore((s) => s.updateTask);
  const openDialog = useCronStore((s) => s.openDialog);
  const connectionStatus = useOfficeStore((s) => s.connectionStatus);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    void fetchTasks();
    const dispose = useCronStore.getState().initEventListeners();
    return dispose;
  }, [fetchTasks, connectionStatus]);

  const handleToggle = (id: string, enabled: boolean) => {
    void updateTask(id, { enabled });
  };

  const handleRun = (id: string) => {
    void runTask(id);
  };

  const handleEdit = (task: CronTask) => {
    openDialog(task);
  };

  const handleDelete = (id: string) => {
    void removeTask(id);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
            <Clock className="h-5 w-5" />
            {t("cron.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("cron.description")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchTasks()}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            {t("cron.refresh")}
          </button>
          <button
            type="button"
            onClick={() => openDialog()}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("cron.addTask")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {tasks.length > 0 && <CronStatsBar tasks={tasks} />}

      {isLoading && tasks.length === 0 ? (
        <LoadingState message={t("cron.loading")} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("cron.empty.title")}
          description={t("cron.empty.description")}
          action={{
            label: t("cron.addTask"),
            onClick: () => openDialog(),
          }}
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <CronTaskCard
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onRun={handleRun}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
