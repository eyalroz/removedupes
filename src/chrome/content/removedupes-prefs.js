var { RemoveDupes } = ChromeUtils.importESModule("chrome://removedupes/content/removedupes-common.sys.mjs");

RemoveDupes.PrefPane = {};
RemoveDupes.PrefPane.init = function () {
  window.addEventListener("dialoghelp", this.openGuide, true);
};

RemoveDupes.PrefPane.openGuide = function (aEvent) {
  try {
    // Open the user guide in the default browser.
    let helpLink = document.getElementById("removeDupesPrefPane").getAttribute("helpURI");
    let uri = Services.io.newURI(helpLink, null, null);
    const protocolService = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);
    protocolService.loadUrl(uri);
  } catch (ex) {
    Console.log(ex);
  }

  // Prevent the default help button behavior
  aEvent.preventDefault();
  aEvent.stopPropagation();
};

