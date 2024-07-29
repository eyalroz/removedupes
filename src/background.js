// Loader / background script
// for the removedupes Thunderbird extension
// by Eyal Rozenberg

function registerDefaultPrefs(manifest) {
  let shortname = manifest.short_name;
  if (!shortname && !manifest.default_prefs) {
    return;
  }
  let path = manifest.default_prefs ?? `defaults/preferences/${shortname}.js`;
  messenger.WindowListener.registerDefaultPrefs(path);
}

function registerOptionsPage(manifest) {
  let shortname = manifest.short_name;
  if (!shortname && !manifest.options_dialog) {
    return;
  }
  let uri = manifest.options_dialog ?? `chrome://${shortname}/content/${shortname}-prefs.xhtml`;
  messenger.WindowListener.registerOptionsPage(uri);
}

// TODO: Instead of registering overlay injectors for windows,
// we should generate overlay injectors ourselves
function registerChromeInjectors(manifest, registrationInfo) {
  let shortname = manifest.short_name;
  if (!shortname) {
    return;
  }
  for (let [windowHref, relativeInjectorPath] of registrationInfo) {
    let absoluteWindowHref = windowHref.startsWith('about:') ? windowHref : `chrome://messenger/content/${windowHref}`;
    let jsFile = `chrome://${shortname}/content/overlay-injectors/${relativeInjectorPath}`;
    messenger.WindowListener.registerWindow(absoluteWindowHref, jsFile);
  }
}

(async function () {
  let manifest = browser.runtime.getManifest();
  let shortname = manifest.short_name;
  if (!manifest.short_name) { return; }

  // Arrange it so that the register doesn't need us to repeat the shortname all the time
  messenger.WindowListener.registerChromeUrl([
    ["content", shortname,                                          "chrome/content/"],

    // skin elements are no longer supported as such, they are now considered just part of the content
    // Overlays can't just be registered and then apply; rather, we need to register an injector script, see below

    // Style elements need not be registered; it's enough to just inject them later on (in injector scripts)

    ["locale",  shortname, "en-US",                                 "chrome/locale/en-US/"],
    ["locale",  shortname, "de",                                    "chrome/locale/de/"],
    ["locale",  shortname, "it",                                    "chrome/locale/it/"],
    ["locale",  shortname, "ja",                                    "chrome/locale/ja/"],
    ["locale",  shortname, "ja-JP-mac",                             "chrome/locale/ja/"],
    ["locale",  shortname, "zh-TW",                                 "chrome/locale/zh-TW/"],
    ["locale",  shortname, "zh-CN",                                 "chrome/locale/zh-CN/"],
    ["locale",  shortname, "sk-SK",                                 "chrome/locale/sk-SK/"],
    ["locale",  shortname, "pt-PT",                                 "chrome/locale/pt-PT/"],
    ["locale",  shortname, "pt-BR",                                 "chrome/locale/pt-BR/"],
    ["locale",  shortname, "nl",                                    "chrome/locale/nl/"],
    ["locale",  shortname, "fr",                                    "chrome/locale/fr/"],
    ["locale",  shortname, "pl",                                    "chrome/locale/pl/"],
    ["locale",  shortname, "he-IL",                                 "chrome/locale/he-IL/"],
    ["locale",  shortname, "ru-RU",                                 "chrome/locale/ru-RU/"],
    ["locale",  shortname, "da",                                    "chrome/locale/da/"],
    ["locale",  shortname, "cs-CZ",                                 "chrome/locale/cs-CZ/"],
    ["locale",  shortname, "es-AR",                                 "chrome/locale/es-AR/"],
    ["locale",  shortname, "es-ES",                                 "chrome/locale/es-ES/"],
    ["locale",  shortname, "is-IS",                                 "chrome/locale/is-IS/"],
    ["locale",  shortname, "sv-SE",                                 "chrome/locale/sv-SE/"],
    ["locale",  shortname, "sl-SI",                                 "chrome/locale/sl-SI/"]
  ]);

  registerChromeInjectors(manifest, [
    ["messenger.xhtml",        "messenger.js"],
    ["about:3pane",            "3pane.js"],
    ["customizeToolbar.xhtml", "customizeToolbar.js"]
  ]);

  registerDefaultPrefs(manifest);
  registerOptionsPage(manifest);
  messenger.WindowListener.startListening();
})();
