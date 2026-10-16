import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { unicodeCLDRtoBCP47 } from "@shared/utils/date";
import { saveLanguagePreference } from "~/utils/language";
import useCurrentUser from "./useCurrentUser";

/** Save the current user's language, keeping the previous preference on failure. */
export function useLanguagePreference() {
  const user = useCurrentUser();
  const { t, i18n } = useTranslation();
  const saving = useRef(false);
  const [isSaving, setSaving] = useState(false);

  const saveLanguage = async (language: string | null) => {
    if (!language || saving.current || user.isSaving) {
      return false;
    }
    saving.current = true;
    setSaving(true);
    try {
      await saveLanguagePreference(language, i18n, async (value) => {
        await user.save({ language: value });
      });
      toast.success(
        i18n.getFixedT(unicodeCLDRtoBCP47(language))("Preferences saved")
      );
      return true;
    } catch (_err) {
      toast.error(t("Unable to change language. Please try again."));
      return false;
    } finally {
      saving.current = false;
      setSaving(false);
    }
  };

  return { saveLanguage, isSaving };
}
