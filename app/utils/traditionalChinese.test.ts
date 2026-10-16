import en from "@shared/i18n/locales/en_US/translation.json";
import tw from "@shared/i18n/locales/zh_TW/translation.json";

const untranslated = new Set([
  "HTML",
  "PDF",
  "Markdown",
  "API",
  "Enter",
  "Tab",
  "URL",
  "Word",
]);
const translations: Record<string, string> = tw;

it.each(Object.entries(en))(
  "has a complete Traditional Chinese translation for %s",
  (key, english) => {
    const translation = translations[key];
    expect(translation?.trim()).toBeTruthy();
    if (!untranslated.has(key)) {
      expect(translation).not.toBe(english);
    }
    expect((translation.match(/{{.*?}}/g) || []).sort()).toEqual(
      (english.match(/{{.*?}}/g) || []).sort()
    );
    expect((translation.match(/<\/?[\w]+>/g) || []).sort()).toEqual(
      (english.match(/<\/?[\w]+>/g) || []).sort()
    );
  }
);
