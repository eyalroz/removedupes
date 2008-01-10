var gRemoveDupesPrefPane = {

#ifndef MOZ_THUNDERBIRD
#expand  _extVersion: "__VERSION__",
#endif

  init: function() {
#ifdef MOZ_THUNDERBIRD
    window.addEventListener("dialoghelp", this.openGuide, true);
#else
    // expose the extension version
    var header = top.document.getElementById("header");
    if (header)
      header.setAttribute("description", this._extVersion);

#ifdef DEBUG
    //parent.hPrefWindow
    //      .registerOKCallbackFunc(myCallbackFunction);
#endif

#endif
  },

#ifdef MOZ_THUNDERBIRD
  openGuide: function(aEvent) {
    try {
      // Open the user guide in the default browser.
      var helpLink = document.getElementById("removeDupesPrefPane")
                             .getAttribute("helpURI");
      var uri = Components.classes["@mozilla.org/network/io-service;1"]
                          .getService(Components.interfaces.nsIIOService)
                          .newURI(helpLink, null, null);
      var protocolSvc =
        Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                  .getService(Components.interfaces.nsIExternalProtocolService);
      protocolSvc.loadUrl(uri);
    }
    catch(ex) {
      dump(ex);
    }

    // Prevent the default help button behavior
    aEvent.preventDefault();
    aEvent.stopPropagation();
  }
#else
  onunload: function() {
    // clean up the header description
    var header = top.document.getElementById("header");
    if (header)
      header.removeAttribute("description");
  }
#endif

};
