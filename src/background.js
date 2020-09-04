  // Loader / background script
  // for the removedupes Thunderbird extension
  // by Eyal Rozenberg

(async function() {
  messenger.WindowListener.registerDefaultPrefs("defaults/preferences/removedupes.js");
  messenger.WindowListener.registerChromeUrl([
    ["content", "removedupes",                                          "chrome/content/"],

// Formerly skin elements, which are no longer supported; these are now just content (problematic...)
//  ["content", "removedupes",                                          "chrome/content/skin/classic/"]
//  ["content", "removedupes",                                          "chrome/skin/classic/"]

// Overlays can't just be registered and then apply. Rather, we need to register an injector script, see below
//  ["overlay", "chrome://messenger/content/messenger.xul",             "chrome://removedupes/content/removedupes-mailWindowOverlay.xul"]
//  ["overlay", "chrome://messenger/content/messenger.xul",             "chrome://removedupes/content/removedupes-button.xul"]

// Style elements need not be registered; it's enough to just inject them later on (in injector scripts)
//  ["style",  "chrome://messenger/content/customizeToolbar.xul",       "chrome://removedupes/content/skin/classic/removedupes-button.css"]
//  ["style",  "chrome://messenger/content/removedupes-dialog.xul",     "chrome://removedupes/content/skin/classic/removedupes-dialog.css"]
//  ["style",  "chrome://messenger/content/messenger.xul",              "chrome://removedupes/content/skin/classic/removedupes-messenger.css"]
//  ["style",  "chrome://messenger/content/removedupes-dialog.xul",     "platform/Darwin/chrome/skin/classic/removedupes-dialog-macos.css"]

    ["locale",  "removedupes", "en-US",                                 "chrome/locale/en-US/"],
    ["locale",  "removedupes", "de",                                    "chrome/locale/de/"],
    ["locale",  "removedupes", "it",                                    "chrome/locale/it/"],
    ["locale",  "removedupes", "ja",                                    "chrome/locale/ja/"],
    ["locale",  "removedupes", "ja-JP-mac",                             "chrome/locale/ja/"],
    ["locale",  "removedupes", "zh-TW",                                 "chrome/locale/zh-TW/"],
    ["locale",  "removedupes", "zh-CN",                                 "chrome/locale/zh-CN/"],
    ["locale",  "removedupes", "sk-SK",                                 "chrome/locale/sk-SK/"],
    ["locale",  "removedupes", "pt-PT",                                 "chrome/locale/pt-PT/"],
    ["locale",  "removedupes", "pt-BR",                                 "chrome/locale/pt-BR/"],
    ["locale",  "removedupes", "nl",                                    "chrome/locale/nl/"],
    ["locale",  "removedupes", "fr",                                    "chrome/locale/fr/"],
    ["locale",  "removedupes", "pl",                                    "chrome/locale/pl/"],
    ["locale",  "removedupes", "he-IL",                                 "chrome/locale/he-IL/"],
    ["locale",  "removedupes", "ru-RU",                                 "chrome/locale/ru-RU/"],
    ["locale",  "removedupes", "da",                                    "chrome/locale/da/"],
    ["locale",  "removedupes", "cs-CZ",                                 "chrome/locale/cs-CZ/"],
    ["locale",  "removedupes", "es-AR",                                 "chrome/locale/es-AR/"],
    ["locale",  "removedupes", "es-ES",                                 "chrome/locale/es-ES/"],
    ["locale",  "removedupes", "is-IS",                                 "chrome/locale/is-IS/"],
    ["locale",  "removedupes", "sv-SE",                                 "chrome/locale/sv-SE/"],
    ["locale",  "removedupes", "sl-SI",                                 "chrome/locale/sl-SI/"]
  ]);

  let browserInfo = await browser.runtime.getBrowserInfo();
  let majorVersion = parseInt(browserInfo.version.split('.',1)[0]);
  let xulSuffix = (majorVersion >= 69 ? "xhtml" : "xul");
  messenger.WindowListener.registerWindow("chrome://messenger/content/messenger." + xulSuffix,       "chrome://removedupes/content/overlay-injectors/messenger.js");
  messenger.WindowListener.registerWindow("chrome://messenger/content/customizeToolbar." + xulSuffix, "chrome://removedupes/content/overlay-injectors/customizeToolbar.js");
  messenger.WindowListener.registerOptionsPage("chrome://removedupes/content/removedupes-prefs." + xulSuffix)
  messenger.WindowListener.startListening();
})()
