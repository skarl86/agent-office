import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon, Wifi, WifiOff, Monitor, Menu } from "lucide-react";
import { useOfficeStore } from "@/store/office-store";
import { useResponsive } from "@/hooks/useResponsive";

export function TopBar() {
  const { t, i18n } = useTranslation("layout");
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useOfficeStore((s) => s.theme);
  const setTheme = useOfficeStore((s) => s.setTheme);
  const connectionStatus = useOfficeStore((s) => s.connectionStatus);
  const setMobileOpen = useOfficeStore((s) => s.setSidebarMobileOpen);
  const { isMobile } = useResponsive();

  const isOffice = location.pathname === "/";
  const isConsole = !isOffice;

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const toggleLang = () => {
    const next = i18n.language === "ko" ? "en" : "ko";
    void i18n.changeLanguage(next);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Hamburger: only in console on mobile */}
        {isMobile && isConsole && (
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
            aria-label="메뉴 열기"
          >
            <Menu size={18} />
          </button>
        )}

        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)]"
        >
          <Monitor size={18} />
          {!isMobile && <span>Agent Office</span>}
        </button>

        <nav className="flex items-center gap-1">
          <button
            onClick={() => navigate("/")}
            className={`rounded px-2 py-1 text-xs font-medium transition sm:px-3 ${
              isOffice
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
            }`}
          >
            {t("topbar.office")}
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className={`rounded px-2 py-1 text-xs font-medium transition sm:px-3 ${
              isConsole
                ? "bg-[var(--color-accent)] text-white"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
            }`}
          >
            {t("topbar.console")}
          </button>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {!isMobile && <ConnectionBadge status={connectionStatus} />}

        <button
          onClick={toggleLang}
          className="rounded p-1.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
          title={i18n.language === "ko" ? t("topbar.language.switchToEn") : t("topbar.language.switchToKo")}
        >
          {i18n.language === "ko" ? "EN" : "KO"}
        </button>

        <button
          onClick={toggleTheme}
          className="rounded p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
          title={theme === "dark" ? t("topbar.theme.switchToLight") : t("topbar.theme.switchToDark")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  const { t } = useTranslation("common");
  const isConnected = status === "connected";

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {isConnected ? (
        <Wifi size={14} className="text-green-500" />
      ) : (
        <WifiOff size={14} className="text-red-400" />
      )}
      <span className={isConnected ? "text-green-500" : "text-red-400"}>
        {t(`status.${status}`)}
      </span>
    </div>
  );
}
