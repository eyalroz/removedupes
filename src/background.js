// Thunderbird regular extension loader script
//
// Note: All extension-specific information is passed through the manifest; avoid
// modifying this file unless absolutely necessary

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
function registerChromeInjectors(chromeInjectors) {
  let manifest = browser.runtime.getManifest();
  let shortname = manifest.short_name;
  if (!shortname) {
    return false;
  }
  chromeInjectors ??= manifest.chrome_injectors;
  for (let [windowHref, rawInjectionUri] of chromeInjectors) {
    let absoluteWindowHref = windowHref.startsWith('about:') ? windowHref : `chrome://messenger/content/${windowHref}`;
    let injectionUri = rawInjectionUri.startsWith(`chrome://`) ? rawInjectionUri : `chrome://${shortname}/content/overlay-injectors/${rawInjectionUri}`;
    messenger.WindowListener.registerWindow(absoluteWindowHref, injectionUri);
  }
  return true;
}

(async function () {
  registerChromeUrls();
  registerChromeInjectors();
  registerDefaultPrefs();
  registerOptionsPage();
  messenger.WindowListener.startListening();
})();
