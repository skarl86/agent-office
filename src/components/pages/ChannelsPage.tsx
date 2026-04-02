import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Radio, RefreshCw } from "lucide-react";
import { useChannelsStore } from "@/store/console-stores/channels-store";
import { ChannelCard } from "@/components/console/channels/ChannelCard";
import { ChannelStatsBar } from "@/components/console/channels/ChannelStatsBar";
import { AvailableChannelGrid } from "@/components/console/channels/AvailableChannelGrid";
import { LoadingState } from "@/components/console/shared/LoadingState";
import type { ChannelInfo, ChannelType } from "@/gateway/adapter-types";

export function ChannelsPage() {
  const { t } = useTranslation("console");
  const channels = useChannelsStore((s) => s.channels);
  const isLoading = useChannelsStore((s) => s.isLoading);
  const error = useChannelsStore((s) => s.error);
  const fetchChannels = useChannelsStore((s) => s.fetchChannels);
  const logoutChannel = useChannelsStore((s) => s.logoutChannel);
  const openConfigDialog = useChannelsStore((s) => s.openConfigDialog);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const handleLogout = (channel: ChannelInfo) => {
    void logoutChannel(channel.id, channel.accountId);
  };

  const handleDetail = (channel: ChannelInfo) => {
    openConfigDialog(channel.type, channel);
  };

  const handleSelectChannel = (channelType: ChannelType) => {
    openConfigDialog(channelType);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
            <Radio className="h-5 w-5" />
            {t("channels.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t("channels.description")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchChannels()}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          {t("channels.refresh")}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {isLoading && channels.length === 0 ? (
        <LoadingState message={t("channels.loading")} />
      ) : (
        <>
          {channels.length > 0 && (
            <div className="space-y-4">
              <ChannelStatsBar channels={channels} />
              <div className="space-y-3">
                {channels.map((channel) => (
                  <ChannelCard
                    key={channel.id}
                    channel={channel}
                    onLogout={handleLogout}
                    onDetail={handleDetail}
                  />
                ))}
              </div>
            </div>
          )}

          <AvailableChannelGrid channels={channels} onSelect={handleSelectChannel} />
        </>
      )}
    </div>
  );
}
