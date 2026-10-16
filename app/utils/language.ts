import { i18n } from "i18next";
import { languages } from "@shared/i18n";
import { unicodeCLDRtoBCP47 } from "@shared/utils/date";
import Desktop from "./Desktop";

/**
 * Formats a number using the user's locale where possible.
 *
 * @param number The number to format
 * @param locale The locale to use for formatting (BCP47 format)
 * @returns The formatted number as a string
 */
export function formatNumber(number: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale).format(number);
  } catch (e) {
    return number.toString();
  }
}

/**
 * Detects the user's language based on the browser's language settings.
 *
 * @returns The user's language in CLDR format (en_US)
 */
export function detectLanguage(language = navigator.language) {
  const parts = language.replace(/_/g, "-").toLowerCase().split("-");
  const [ln, r] = parts;
  if (ln === "zh") {
    if (parts.includes("hant")) {
      return "zh_TW";
    }
    if (parts.includes("hans")) {
      return "zh_CN";
    }
    return parts.some((part) => ["hk", "mo", "tw"].includes(part))
      ? "zh_TW"
      : "zh_CN";
  }
  const region = (r || ln).toUpperCase();
  return `${ln}_${region}`;
}

/**
 * Changes the language of the app, and updates the spellchecker language
 * if running in the desktop shell.
 *
 * @param locale The locale to change to, in CLDR format (en_US)
 * @param instance The i18n instance to use
 */
export async function changeLanguage(
  locale: string | null | undefined,
  instance: i18n
) {
  // Languages are stored in en_US format in the database, however the
  // frontend translation framework (i18next) expects en-US
  const localeBCP = locale ? unicodeCLDRtoBCP47(locale) : undefined;

  if (locale && localeBCP && instance.languages?.[0] !== localeBCP) {
    await loadLanguage(locale, instance);
    await instance.changeLanguage(localeBCP);
    await Desktop.bridge?.setSpellCheckerLanguages(["en-US", localeBCP]);
  }
}

/** Load a supported locale before saving or changing the interface language. */
export async function loadLanguage(locale: string, instance: i18n) {
  if (!languages.includes(locale)) {
    throw new Error("Unsupported language");
  }
  const language = unicodeCLDRtoBCP47(locale);
  await instance.loadLanguages(language);
  if (!instance.hasResourceBundle(language, "translation")) {
    throw new Error("Language resources could not be loaded");
  }
}

/** Persist the preference only after its translations have loaded successfully. */
export async function saveLanguagePreference(
  locale: string,
  instance: i18n,
  save: (language: string) => Promise<void>
) {
  await loadLanguage(locale, instance);
  await save(locale);
}
