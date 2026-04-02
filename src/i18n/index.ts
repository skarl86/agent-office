import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// Korean
import koCommon from "./locales/ko/common.json";
import koLayout from "./locales/ko/layout.json";
import koOffice from "./locales/ko/office.json";
import koPanels from "./locales/ko/panels.json";
import koChat from "./locales/ko/chat.json";
import koConsole from "./locales/ko/console.json";

// English
import enCommon from "./locales/en/common.json";
import enLayout from "./locales/en/layout.json";
import enOffice from "./locales/en/office.json";
import enPanels from "./locales/en/panels.json";
import enChat from "./locales/en/chat.json";
import enConsole from "./locales/en/console.json";

const resources = {
  ko: {
    common: koCommon,
    layout: koLayout,
    office: koOffice,
    panels: koPanels,
    chat: koChat,
    console: koConsole,
  },
  en: {
    common: enCommon,
    layout: enLayout,
    office: enOffice,
    panels: enPanels,
    chat: enChat,
    console: enConsole,
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "ko",
    defaultNS: "common",
    ns: ["common", "layout", "office", "panels", "chat", "console"],
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
