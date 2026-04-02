import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Radio, Wrench, Clock, RefreshCw } from "lucide-react";
import { useDashboardStore } from "@/store/console-stores/dashboard-store";
import { useOfficeStore } from "@/store/office-store";
import { StatCard } from "@/components/console/dashboard/StatCard";
import { ChannelOverview } from "@/components/console/dashboard/ChannelOverview";
import { SkillOverview } from "@/components/console/dashboard/SkillOverview";
import { QuickNavGrid } from "@/components/console/dashboard/QuickNavGrid";
import { AlertBanner } from "@/components/console/dashboard/AlertBanner";
import { LoadingState } from "@/components/console/shared/LoadingState";

export function DashboardPage() {
  const { t } = useTranslation("console");
  const { channelsSummary, skillsSummary, usage, isLoading, error, refresh } = useDashboardStore();
  const connectionStatus = useOfficeStore((s) => s.connectionStatus);

  useEffect(() => {
    if (connectionStatus === "connected") {
      refresh();
    }
  }, [refresh, connectionStatus]);

  const connectedChannels = channelsSummary.filter((c) => c.status === "connected").length;
  const activeSkills = skillsSummary.filter((s) => s.enabled).length;

  const usagePercent =
    usage && usage.providers.length > 0
      ? Math.round(
          usage.providers.reduce((sum, p) => {
            const maxPct = p.windows.reduce((m, w) => Math.max(m, w.usedPercent), 0);
            return Math.max(sum, maxPct);
          }, 0),
        )
      : null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {t("dashboard.title")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            {t("dashboard.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {t("dashboard.refresh")}
        </button>
      </div>

      {error && (
        <AlertBanner
          variant="warning"
          message={error}
          actionLabel={t("dashboard.retry")}
          onAction={() => refresh()}
        />
      )}

      {isLoading && !channelsSummary.length && !skillsSummary.length ? (
        <LoadingState message={t("dashboard.loading")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={Bot}
              title={t("dashboard.stats.activeAgents")}
              value="—"
              color="text-blue-500"
            />
            <StatCard
              icon={Radio}
              title={t("dashboard.stats.connectedChannels")}
              value={String(connectedChannels)}
              color="text-green-500"
            />
            <StatCard
              icon={Wrench}
              title={t("dashboard.stats.activeSkills")}
              value={String(activeSkills)}
              color="text-purple-500"
            />
            <StatCard
              icon={Clock}
              title={t("dashboard.stats.cronJobs")}
              value="—"
              color="text-orange-500"
              progress={usagePercent ?? undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ChannelOverview channels={channelsSummary} />
            <SkillOverview skills={skillsSummary} />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
              {t("dashboard.quickNav.title")}
            </h2>
            <QuickNavGrid />
          </div>
        </>
      )}
    </div>
  );
}
