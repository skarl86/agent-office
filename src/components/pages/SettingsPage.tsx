import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings, BrainCircuit, Palette, Server, Info } from "lucide-react";
import { useConfigStore } from "@/store/console-stores/config-store";
import { ProvidersSection } from "@/components/console/settings/ProvidersSection";
import { AppearanceSection } from "@/components/console/settings/AppearanceSection";
import { GatewaySection } from "@/components/console/settings/GatewaySection";
import { AboutSection } from "@/components/console/settings/AboutSection";

type SettingsTab = "providers" | "appearance" | "gateway" | "about";

const TABS: Array<{ id: SettingsTab; icon: typeof Settings; labelKey: string }> = [
  { id: "providers", icon: BrainCircuit, labelKey: "settings.tabs.providers" },
  { id: "appearance", icon: Palette, labelKey: "settings.tabs.appearance" },
  { id: "gateway", icon: Server, labelKey: "settings.tabs.gateway" },
  { id: "about", icon: Info, labelKey: "settings.tabs.about" },
];

export function SettingsPage() {
  const { t } = useTranslation("console");
  const [activeTab, setActiveTab] = useState<SettingsTab>("providers");
  const fetchConfig = useConfigStore((s) => s.fetchConfig);
  const fetchStatus = useConfigStore((s) => s.fetchStatus);

  useEffect(() => {
    void fetchConfig();
    void fetchStatus();
  }, [fetchConfig, fetchStatus]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
          <Settings className="h-5 w-5" />
          {t("settings.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("settings.description")}
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-gray-200 p-1 dark:border-gray-700 w-fit">
        {TABS.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === id
                ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700/50"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "providers" && <ProvidersSection />}
        {activeTab === "appearance" && <AppearanceSection />}
        {activeTab === "gateway" && <GatewaySection />}
        {activeTab === "about" && <AboutSection />}
      </div>
    </div>
  );
}
