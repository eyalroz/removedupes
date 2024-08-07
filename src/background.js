  // Loader / background script
  // for the removedupes Thunderbird extension
  // by Eyal Rozenberg

(async function () {
  messenger.WindowListener.registerDefaultPrefs("defaults/preferences/removedupes.js");
  messenger.WindowListener.registerChromeUrl([
    ["content", "removedupes",                                          "chrome/content/"],

    // skin elements are no longer supported as such, they are now considered just part of the content

    // Overlays can't just be registered and then apply; rather, we need to register an injector script, see below

    // Style elements need not be registered; it's enough to just inject them later on (in injector scripts)

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

  let registerChromeInjectors = function (registrationInfo) {
    for (let [windowHref, relativeInjectorPath] of registrationInfo) {
      let absoluteWindowHref = windowHref.startsWith('about:') ?
        windowHref : `chrome://messenger/content/${windowHref}`;
      let jsFile = `chrome://removedupes/content/overlay-injectors/${relativeInjectorPath}`;
      messenger.WindowListener.registerWindow(absoluteWindowHref, jsFile);
    }
  };

  registerChromeInjectors([
    ["messenger.xhtml",        "messenger.js"],
    ["about:3pane",            "3pane.js"],
    ["customizeToolbar.xhtml", "customizeToolbar.js"]
  ]);

  messenger.WindowListener.registerOptionsPage("chrome://removedupes/content/removedupes-prefs.xhtml");
  messenger.WindowListener.startListening();
})();
