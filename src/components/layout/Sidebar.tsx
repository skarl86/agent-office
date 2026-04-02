import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bot,
  Radio,
  Puzzle,
  Clock,
  Settings,
  PanelLeftClose,
  PanelLeft,
  X,
} from "lucide-react";
import { useOfficeStore } from "@/store/office-store";
import { useResponsive } from "@/hooks/useResponsive";

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, labelKey: "consoleNav.dashboard" },
  { path: "/agents", icon: Bot, labelKey: "consoleNav.agents" },
  { path: "/channels", icon: Radio, labelKey: "consoleNav.channels" },
  { path: "/skills", icon: Puzzle, labelKey: "consoleNav.skills" },
  { path: "/cron", icon: Clock, labelKey: "consoleNav.cron" },
  { path: "/settings", icon: Settings, labelKey: "consoleNav.settings" },
] as const;

export function Sidebar() {
  const { t } = useTranslation("layout");
  const collapsed = useOfficeStore((s) => s.sidebarCollapsed);
  const setCollapsed = useOfficeStore((s) => s.setSidebarCollapsed);
  const mobileOpen = useOfficeStore((s) => s.sidebarMobileOpen);
  const setMobileOpen = useOfficeStore((s) => s.setSidebarMobileOpen);
  const { isMobile, isTablet } = useResponsive();

  // On mobile: sidebar is an overlay (hidden unless mobileOpen)
  // On tablet: sidebar is collapsed by default
  // On desktop: sidebar expanded by default

  if (isMobile) {
    if (!mobileOpen) return null;

    return (
      <aside className="absolute inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
          <span className="text-sm font-semibold text-[var(--color-text)]">Agent Office</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
            title={t("sidebar.closeSidebar")}
          >
            <X size={16} />
          </button>
        </div>
        <nav className="flex-1 py-2">
          {NAV_ITEMS.map(({ path, icon: Icon, labelKey }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/50 hover:text-[var(--color-text)]"
                }`
              }
            >
              <Icon size={18} />
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    );
  }

  // For tablet, default collapsed; desktop, default expanded
  // The collapsed state is managed by the store
  const isCollapsed = isTablet ? collapsed : collapsed;

  return (
    <aside
      className={`flex flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] transition-all duration-200 ${
        isCollapsed ? "w-14" : "w-52"
      }`}
    >
      <div className="flex-1 py-2">
        {NAV_ITEMS.map(({ path, icon: Icon, labelKey }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 text-sm transition ${
                isCollapsed ? "justify-center" : ""
              } ${
                isActive
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]/50 hover:text-[var(--color-text)]"
              }`
            }
          >
            <Icon size={18} />
            {!isCollapsed && <span>{t(labelKey)}</span>}
          </NavLink>
        ))}
      </div>

      <div className="border-t border-[var(--color-border)] p-2">
        <button
          onClick={() => setCollapsed(!isCollapsed)}
          className="flex w-full items-center justify-center rounded p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
          title={isCollapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}
        >
          {isCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
    </aside>
  );
}
