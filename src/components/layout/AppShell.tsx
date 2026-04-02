import type { ReactNode } from "react";
import { TopBar } from "./TopBar";
import { AgentDetailPanel } from "@/components/panels/AgentDetailPanel";
import { useOfficeStore } from "@/store/office-store";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId);
  const selectAgent = useOfficeStore((s) => s.selectAgent);

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">{children}</main>
        {selectedAgentId && (
          <AgentDetailPanel
            agentId={selectedAgentId}
            onClose={() => selectAgent(null)}
          />
        )}
      </div>
    </div>
  );
}
