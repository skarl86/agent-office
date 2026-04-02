import { useTranslation } from "react-i18next";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation("layout");

  const toggleLang = () => {
    const next = i18n.language === "ko" ? "en" : "ko";
    void i18n.changeLanguage(next);
  };

  return (
    <button
      onClick={toggleLang}
      className="rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
      title={i18n.language === "ko" ? t("topbar.language.switchToEn") : t("topbar.language.switchToKo")}
    >
      {i18n.language === "ko" ? "EN" : "KO"}
    </button>
  );
}
