import { useEffect } from "react";
import { ChatDialog } from "@/components/chat/ChatDialog";
import { useChatDockStore } from "@/store/console-stores/chat-dock-store";

export function ChatPage() {
  const loadSessions = useChatDockStore((s) => s.loadSessions);
  const loadHistory = useChatDockStore((s) => s.loadHistory);

  useEffect(() => {
    void loadSessions();
    void loadHistory();
  }, [loadSessions, loadHistory]);

  return (
    <div className="flex h-full">
      <ChatDialog />
    </div>
  );
}
