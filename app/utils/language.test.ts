import { createInstance } from "i18next";
import { detectLanguage, saveLanguagePreference } from "./language";

it.each([
  ["zh-HK", "zh_TW"],
  ["zh-MO", "zh_TW"],
  ["zh-TW", "zh_TW"],
  ["zh-Hant", "zh_TW"],
  ["zh-Hant-CN", "zh_TW"],
  ["zh_CN", "zh_CN"],
  ["zh-SG", "zh_CN"],
  ["zh-Hans", "zh_CN"],
  ["zh-Hans-HK", "zh_CN"],
  ["zh", "zh_CN"],
  ["en-US", "en_US"],
])("detects %s as %s", (browser, expected) => {
  expect(detectLanguage(browser)).toBe(expected);
});

async function instance() {
  const value = createInstance();
  await value.init({
    lng: "en-US",
    fallbackLng: false,
    resources: { "en-US": { translation: { Search: "Search" } } },
  });
  return value;
}

it("loads translations before saving, without changing the interface", async () => {
  const i18n = await instance();
  const order: string[] = [];
  jest.spyOn(i18n, "loadLanguages").mockImplementation(async () => {
    order.push("load");
    i18n.addResourceBundle("zh-TW", "translation", { Search: "搜尋" });
  });
  const save = jest.fn(async () => {
    order.push("save");
  });
  await saveLanguagePreference("zh_TW", i18n, save);
  expect(order).toEqual(["load", "save"]);
  expect(save).toHaveBeenCalledWith("zh_TW");
  expect(i18n.language).toBe("en-US");
});

it("does not save when the requested resource bundle is missing", async () => {
  const i18n = await instance();
  const save = jest.fn();
  await expect(saveLanguagePreference("zh_TW", i18n, save)).rejects.toThrow();
  expect(save).not.toHaveBeenCalled();
  expect(i18n.language).toBe("en-US");
});

it("keeps the interface unchanged when saving fails", async () => {
  const i18n = await instance();
  i18n.addResourceBundle("zh-TW", "translation", { Search: "搜尋" });
  await expect(
    saveLanguagePreference("zh_TW", i18n, async () => {
      throw new Error("Save failed");
    })
  ).rejects.toThrow("Save failed");
  expect(i18n.language).toBe("en-US");
});

it("rejects unsupported locales before saving", async () => {
  const i18n = await instance();
  const save = jest.fn();
  await expect(saveLanguagePreference("zh_HK", i18n, save)).rejects.toThrow(
    "Unsupported language"
  );
  expect(save).not.toHaveBeenCalled();
});
