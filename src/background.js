// Loader / background script
// for the removedupes Thunderbird extension
// by Eyal Rozenberg

import { registerChromeUrl, registerDefaultPrefs, registerOptionsPage, registerChromeInjectors } from './registration.mjs';

(async function () {
  let shortname = browser.runtime.getManifest().short_name;
  if (!shortname) { return; }

  // Arrange it so that the register doesn't need us to repeat the shortname all the time
  let chromeUrls = [
    ["content",                                          "chrome/content/"],

    // skin elements are no longer supported as such, they are now considered just part of the content
    // Overlays can't just be registered and then apply; rather, we need to register an injector script, see below

    // Style elements need not be registered; it's enough to just inject them later on (in injector scripts)

    ["locale",  "en-US",                                 "chrome/locale/en-US/"],
    ["locale",  "de",                                    "chrome/locale/de/"],
    ["locale",  "it",                                    "chrome/locale/it/"],
    ["locale",  "ja",                                    "chrome/locale/ja/"],
    ["locale",  "ja-JP-mac",                             "chrome/locale/ja/"],
    ["locale",  "zh-TW",                                 "chrome/locale/zh-TW/"],
    ["locale",  "zh-CN",                                 "chrome/locale/zh-CN/"],
    ["locale",  "sk-SK",                                 "chrome/locale/sk-SK/"],
    ["locale",  "pt-PT",                                 "chrome/locale/pt-PT/"],
    ["locale",  "pt-BR",                                 "chrome/locale/pt-BR/"],
    ["locale",  "nl",                                    "chrome/locale/nl/"],
    ["locale",  "fr",                                    "chrome/locale/fr/"],
    ["locale",  "pl",                                    "chrome/locale/pl/"],
    ["locale",  "he-IL",                                 "chrome/locale/he-IL/"],
    ["locale",  "ru-RU",                                 "chrome/locale/ru-RU/"],
    ["locale",  "da",                                    "chrome/locale/da/"],
    ["locale",  "cs-CZ",                                 "chrome/locale/cs-CZ/"],
    ["locale",  "es-AR",                                 "chrome/locale/es-AR/"],
    ["locale",  "es-ES",                                 "chrome/locale/es-ES/"],
    ["locale",  "is-IS",                                 "chrome/locale/is-IS/"],
    ["locale",  "sv-SE",                                 "chrome/locale/sv-SE/"],
    ["locale",  "sl-SI",                                 "chrome/locale/sl-SI/"]
  ];

  registerChromeUrl(chromeUrls);
  registerChromeInjectors([
    ["messenger.xhtml",        "messenger.js"],
    ["about:3pane",            "3pane.js"],
    ["customizeToolbar.xhtml", "customizeToolbar.js"]
  ]);

  registerDefaultPrefs();
  registerOptionsPage();
  messenger.WindowListener.startListening();
})();
