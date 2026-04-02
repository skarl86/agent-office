import { Outlet } from "react-router-dom";
import { TopBar } from "./TopBar";
import { Sidebar } from "./Sidebar";
import { useOfficeStore } from "@/store/office-store";
import { useResponsive } from "@/hooks/useResponsive";

export function ConsoleLayout() {
  const mobileOpen = useOfficeStore((s) => s.sidebarMobileOpen);
  const setMobileOpen = useOfficeStore((s) => s.setSidebarMobileOpen);
  const { isMobile } = useResponsive();

  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="relative flex flex-1 overflow-hidden">
        {/* Mobile overlay backdrop */}
        {isMobile && mobileOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar />
        <main className="flex-1 overflow-auto bg-[var(--color-bg)] p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
