import { useEffect } from "react";
import { ChatDialog } from "@/components/chat/ChatDialog";
import { useChatDockStore } from "@/store/console-stores/chat-dock-store";
import { useOfficeStore } from "@/store/office-store";

export function ChatPage() {
  const loadSessions = useChatDockStore((s) => s.loadSessions);
  const loadHistory = useChatDockStore((s) => s.loadHistory);
  const connectionStatus = useOfficeStore((s) => s.connectionStatus);

  useEffect(() => {
    if (connectionStatus === "connected") {
      void loadSessions();
      void loadHistory();
    }
  }, [loadSessions, loadHistory, connectionStatus]);

  return (
    <div className="flex h-full">
      <ChatDialog />
    </div>
  );
}
