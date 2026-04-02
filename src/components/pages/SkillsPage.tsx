import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Puzzle, RefreshCw, Search } from "lucide-react";
import { useSkillsStore, filterInstalledSkills } from "@/store/console-stores/skills-store";
import { useOfficeStore } from "@/store/office-store";
import { SkillCard } from "@/components/console/skills/SkillCard";
import { SkillDetailDialog } from "@/components/console/skills/SkillDetailDialog";
import { LoadingState } from "@/components/console/shared/LoadingState";
import { EmptyState } from "@/components/console/shared/EmptyState";
import type { SkillInfo } from "@/gateway/adapter-types";
import type { SkillSourceFilter } from "@/store/console-stores/skills-store";

const SOURCE_FILTERS: Array<{ value: SkillSourceFilter; labelKey: string }> = [
  { value: "all", labelKey: "skills.filter.all" },
  { value: "built-in", labelKey: "skills.filter.builtIn" },
  { value: "marketplace", labelKey: "skills.filter.marketplace" },
];

export function SkillsPage() {
  const { t } = useTranslation("console");
  const skills = useSkillsStore((s) => s.skills);
  const isLoading = useSkillsStore((s) => s.isLoading);
  const error = useSkillsStore((s) => s.error);
  const sourceFilter = useSkillsStore((s) => s.sourceFilter);
  const selectedSkill = useSkillsStore((s) => s.selectedSkill);
  const detailDialogOpen = useSkillsStore((s) => s.detailDialogOpen);
  const installing = useSkillsStore((s) => s.installing);
  const fetchSkills = useSkillsStore((s) => s.fetchSkills);
  const setSourceFilter = useSkillsStore((s) => s.setSourceFilter);
  const toggleSkill = useSkillsStore((s) => s.toggleSkill);
  const openDetail = useSkillsStore((s) => s.openDetail);
  const closeDetail = useSkillsStore((s) => s.closeDetail);

  const connectionStatus = useOfficeStore((s) => s.connectionStatus);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (connectionStatus === "connected") {
      void fetchSkills();
    }
  }, [fetchSkills, connectionStatus]);

  const filteredSkills = filterInstalledSkills(skills, query, sourceFilter);

  const handleToggle = (skillKey: string, enabled: boolean) => {
    void toggleSkill(skillKey, enabled);
  };

  const handleConfigure = (skill: SkillInfo) => {
    openDetail(skill);
  };

  const handleSaved = () => {
    void fetchSkills();
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
            <Puzzle className="h-5 w-5" />
            {t("skills.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("skills.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchSkills()}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {t("skills.refresh")}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skills.searchPlaceholder")}
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-gray-600">
          {SOURCE_FILTERS.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSourceFilter(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceFilter === value
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {isLoading && skills.length === 0 ? (
        <LoadingState message={t("skills.loading")} />
      ) : filteredSkills.length === 0 ? (
        <EmptyState
          icon={Puzzle}
          title={t("skills.empty.title")}
          description={t("skills.empty.description")}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              onConfigure={handleConfigure}
              isInstalling={installing.has(skill.id)}
            />
          ))}
        </div>
      )}

      <SkillDetailDialog
        open={detailDialogOpen}
        skill={selectedSkill}
        onClose={closeDetail}
        onSaved={handleSaved}
      />
    </div>
  );
}
