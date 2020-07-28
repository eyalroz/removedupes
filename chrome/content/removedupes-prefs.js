const Cc = Components.classes;
const Ci = Components.interfaces;

var rdModuleURI = "chrome://removedupes/content/removedupes-common.js";
if (typeof(ChromeUtils) != "undefined") {
  if (ChromeUtils.import) {
    var { RemoveDupes } = ChromeUtils.import(rdModuleURI);
  }
  else { Components.utils.import(rdModuleURI);}
}
else { Components.utils.import(rdModuleURI); }

RemoveDupes.PrefPane = {

  init: function() {
    window.addEventListener("dialoghelp", this.openGuide, true);
  },

  openGuide: function(aEvent) {
    try {
      // Open the user guide in the default browser.
      var helpLink = document.getElementById("removeDupesPrefPane")
                             .getAttribute("helpURI");
      var uri = Cc["@mozilla.org/network/io-service;1"]
                          .getService(Ci.nsIIOService)
                          .newURI(helpLink, null, null);
      var protocolSvc =
        Cc["@mozilla.org/uriloader/external-protocol-service;1"]
                  .getService(Ci.nsIExternalProtocolService);
      protocolSvc.loadUrl(uri);
    }
    catch(ex) {
      dump(ex);
    }

    // Prevent the default help button behavior
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }

};
