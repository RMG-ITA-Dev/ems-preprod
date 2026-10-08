import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalSettings } from "@/hooks/useEmsData";

export function LanguageSync() {
  const { i18n } = useTranslation();
  const { data: settings } = useGlobalSettings();

  useEffect(() => {
    if (settings) {
      // Sync language setting
      const languageSetting = settings.find((s) => s.setting_key === "LANGUAGE");
      if (languageSetting && languageSetting.setting_value !== i18n.language) {
        i18n.changeLanguage(languageSetting.setting_value);
      }

      // Sync compact font setting
      const compactFontSetting = settings.find((s) => s.setting_key === "COMPACT_FONT");
      const isCompact = compactFontSetting?.setting_value === "true";
      document.documentElement.dataset.compactFont = isCompact ? "true" : "false";
    }
  }, [settings, i18n]);

  // `lang` vive en index.html como valor estatico, asi que sin esto el idioma que
  // anuncian lectores de pantalla y traductores queda fijo aunque la UI cambie.
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return null;
}
