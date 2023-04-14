const Cc = Components.classes;
const Ci = Components.interfaces;

var { RemoveDupes } = ChromeUtils.import("chrome://removedupes/content/removedupes-common.js");

RemoveDupes.PrefPane = {

  init: function() {
    window.addEventListener("dialoghelp", this.openGuide, true);
  },

  openGuide: function(aEvent) {
    try {
      // Open the user guide in the default browser.
      var helpLink = document.getElementById("removeDupesPrefPane").getAttribute("helpURI");
      var uri = Services.io.newURI(helpLink, null, null);
      var protocolService = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);
      protocolService.loadUrl(uri);
    }
    catch(ex) {
      dump(ex);
    }

    // Prevent the default help button behavior
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }

};
