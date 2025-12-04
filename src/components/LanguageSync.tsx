import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalSettings } from "@/hooks/useEmsData";

export function LanguageSync() {
  const { i18n } = useTranslation();
  const { data: settings } = useGlobalSettings();

  useEffect(() => {
    if (settings) {
      const languageSetting = settings.find((s) => s.setting_key === "LANGUAGE");
      if (languageSetting && languageSetting.setting_value !== i18n.language) {
        i18n.changeLanguage(languageSetting.setting_value);
      }
    }
  }, [settings, i18n]);

  return null;
}
