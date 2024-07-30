// Helper functions for Mozilla extension chrome registration
// (based on the WindowListener mechanism); import these into
// your background.js script - when it's loaded as a module
// which can perform imports

// This wrapper around the WindowListener's registerChromeUrl function
// is intended to make life easier for the extension author in two ways:
//
// 1. It is flexible in the chrome URL (specification) format: One can
//    skip the extension shortname, and even skip the location in favor
//    of a default based on initial fields
export function registerChromeUrl(chromeUrls) {
  let shortname = browser.runtime.getManifest().short_name;
  if (!shortname) {
    return false;
  }
  let possiblyAddExtensionShortname = (chromeUrl) =>
    chromeUrl[1] == shortname ? chromeUrl : chromeUrl.toSpliced(1, 0, shortname);
  chromeUrls = chromeUrls.map(possiblyAddExtensionShortname);

  let fillDefaultWhenLocationIsMissing = (chromeUrl) => {
    let type = chromeUrl[0];
    switch(type) {
    case "locale":
      if (chromeUrl.length == 3) {
        // e.g. [ "locale", shortname, "zh-CN" ] with no path
        let localeSpec = chromeUrl[1];
        return [ ...chromeUrl, `chrome/locale/${localeSpec}` ];
      }
      break;
    case "content":
      if (chromeUrl.length == 2) {
        // e.g. [ "chrome", shortname ] with no path
        return [ ... chromeUrl, 'chrome/content/' ];
      }
    }
    return chromeUrl;
  }
  chromeUrls = chromeUrls.map(fillDefaultWhenLocationIsMissing);
  for(let cu of chromeUrls) {
    console.log(`chrome URL: ${cu.toString()}`);
  }
  messenger.WindowListener.registerChromeUrl(chromeUrls);
  return true;
}

export function registerDefaultPrefs(path) {
  let manifest = browser.runtime.getManifest();
  let shortname = manifest.short_name;
  if (!(path || shortname || manifest.default_prefs)) {
    return false;
  }
  path ??= manifest.default_prefs ?? `defaults/preferences/${shortname}.js`;
  messenger.WindowListener.registerDefaultPrefs(path);
  return true;
}

export function registerOptionsPage(uri) {
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
export function registerChromeInjectors(registrationInfo) {
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
