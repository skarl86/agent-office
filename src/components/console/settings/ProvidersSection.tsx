import { BrainCircuit } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/console/shared/EmptyState";
import { useConfigStore } from "@/store/console-stores/config-store";
import { ProviderCard } from "./ProviderCard";

function extractProviders(
  config: Record<string, unknown> | null,
): Record<string, Record<string, unknown>> {
  if (!config) return {};
  const models = config.models as Record<string, unknown> | undefined;
  const providers = models?.providers as Record<string, Record<string, unknown>> | undefined;
  return providers ?? {};
}

export function ProvidersSection() {
  const { t } = useTranslation("console");
  const config = useConfigStore((s) => s.config);

  const providers = extractProviders(config);
  const providerEntries = Object.entries(providers);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {t("settings.providers.title")}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("settings.providers.description")}
        </p>
      </div>

      {providerEntries.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title={t("settings.providers.empty")}
          description={t("settings.providers.emptyHint")}
        />
      ) : (
        <div className="space-y-2">
          {providerEntries.map(([id, cfg]) => (
            <ProviderCard
              key={id}
              providerId={id}
              config={cfg}
              onEdit={() => {}}
              onDelete={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
