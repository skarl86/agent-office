import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Bot } from "lucide-react";
import { useAgentsStore } from "@/store/console-stores/agents-store";
import { AgentListPanel } from "@/components/console/agents/AgentListPanel";
import { AgentDetailHeader } from "@/components/console/agents/AgentDetailHeader";
import { AgentDetailTabs } from "@/components/console/agents/AgentDetailTabs";
import { CreateAgentDialog } from "@/components/console/agents/CreateAgentDialog";
import { DeleteAgentDialog } from "@/components/console/agents/DeleteAgentDialog";
import { LoadingState } from "@/components/console/shared/LoadingState";
import { EmptyState } from "@/components/console/shared/EmptyState";

export function AgentsPage() {
  const { t } = useTranslation("console");
  const { agents, selectedAgentId, isLoading, fetchAgents, setCreateDialogOpen } = useAgentsStore();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="flex h-full gap-4 p-4">
      <AgentListPanel />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {isLoading && agents.length === 0 ? (
          <LoadingState message={t("agents.loading")} />
        ) : selectedAgent ? (
          <>
            <AgentDetailHeader agent={selectedAgent} />
            <AgentDetailTabs agent={selectedAgent} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={Bot}
              title={t("agents.selectAgentTitle")}
              description={t("agents.selectAgentDesc")}
              action={{
                label: t("agents.addAgent"),
                onClick: () => setCreateDialogOpen(true),
              }}
            />
          </div>
        )}
      </div>

      <CreateAgentDialog />
      <DeleteAgentDialog />
    </div>
  );
}
