// Loader / background script
// for the removedupes Thunderbird extension
// by Eyal Rozenberg

// TODO: Support overriding the set of content locations from manifest.json
// TODO: Support taking the locales either from an argument or from manifest.json
function registerChromeUrls(locales) {
  let manifest = browser.runtime.getManifest();
  let shortname = manifest.short_name;
  locales ??= manifest.locales;
  if (!shortname || !locales) {
    return false;
  }
  // I know this is weird, I don't understand this ja-JP-mac business myself; do we need it?
  let localeToPath = (localeSpec) => `chrome/locale/${(localeSpec == "ja-JP-mac") ? "ja" : localeSpec}/`;
  let localeToChromeUrl = (localeSpec) => ["locale", shortname, localeSpec, localeToPath(localeSpec)];
  let chromeUrls = [
    ["content", shortname, "chrome/content/"],
    ...locales.map(localeToChromeUrl)
  ];
  messenger.WindowListener.registerChromeUrl(chromeUrls);
  return true;
}

function registerDefaultPrefs(path) {
  let manifest = browser.runtime.getManifest();
  let shortname = manifest.short_name;
  if (!(path || shortname || manifest.default_prefs)) {
    return false;
  }
  path ??= manifest.default_prefs ?? `defaults/preferences/${shortname}.js`;
  messenger.WindowListener.registerDefaultPrefs(path);
  return true;
}

function registerOptionsPage(uri) {
  let manifest = browser.runtime.getManifest();
  let shortname = manifest.short_name;
  if (!(uri || shortname || manifest.options_dialog)) {
    return false;
  }
  uri ??= manifest.options_dialog ?? `chrome://${shortname}/content/${shortname}-prefs.xhtml`;
  messenger.WindowListener.registerOptionsPage(uri);
  return true;
}

// TODO: Instead of registering overlay injectors for windows,
// we should generate overlay injectors ourselves
function registerChromeInjectors(registrationInfo) {
  let manifest = browser.runtime.getManifest();
  let shortname = manifest.short_name;
  if (!shortname) {
    return false;
  }
  for (let [windowHref, relativeInjectorPath] of registrationInfo) {
    let absoluteWindowHref = windowHref.startsWith('about:') ?
      windowHref : `chrome://messenger/content/${windowHref}`;
    let inectorJSFile = `chrome://${shortname}/content/overlay-injectors/${relativeInjectorPath}`;
    messenger.WindowListener.registerWindow(absoluteWindowHref, inectorJSFile);
  }
  return true;
}

(async function () {
  registerChromeUrls();
  registerChromeInjectors([
    ["messenger.xhtml",        "messenger.js"],
    ["about:3pane",            "3pane.js"],
    ["customizeToolbar.xhtml", "customizeToolbar.js"]
  ]);
  registerDefaultPrefs();
  registerOptionsPage();
  messenger.WindowListener.startListening();
})();
