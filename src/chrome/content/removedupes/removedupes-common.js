// localized strings

var gRemoveDupesStrings =
  Components.classes["@mozilla.org/intl/stringbundle;1"]
            .getService(Components.interfaces.nsIStringBundleService)
            .createBundle("chrome://removedupes/locale/removedupes.properties");

//---------------------------------------------------------

// Helper object for preferences

const preferencePrefix = "removedupes.mail.";

var gRemoveDupesPrefs = {
  _prefService: null,

  get prefService()
  {
    if (!this._prefService) 
      this._prefService =
        Components.classes["@mozilla.org/preferences-service;1"]
                  .getService(Components.interfaces.nsIPrefBranch);

    return this._prefService;
  },

  getBoolPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getBoolPref(preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getCharPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getCharPref(preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getIntPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getIntPref(preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  setBoolPref: function(prefName, val) {
    this.prefService.setBoolPref(preferencePrefix + prefName, val);
  },

  setCharPref: function(prefName, val) {
    this.prefService.setCharPref(preferencePrefix + prefName, val);
  },

  setIntPref: function(prefName, val) {
    this.prefService.setIntPref(preferencePrefix + prefName, val);
  },

}

//---------------------------------------------------------

function removeDuplicates(dupeMessageRecords,deletionIndicators,justMoveToTrah)
{
#ifdef DEBUG_removeDuplicates
  jsConsoleService.logStringMessage('in reviewAndRemove\ndupeMessageRecords.length = '+ dupeMessageRecords.length);
#endif

  var removalMessageHdrs =
    Components.classes["@mozilla.org/supports-array;1"]
              .createInstance(Components.interfaces.nsISupportsArray);
  for ( var i=0; i<dupeMessageRecords.length; i++ ) {
    if ( deletionIndicators[i] ) {
      // note that messenger and msgWindow have to be defined! if we're running from the
      // overlay of the 3-pane window, then this is ensured; otherwise,
      // the dupes review dialog should have gotten it as a parameter
      // and set a global window-global variable of its own
#ifdef DEBUG_removeDuplicates
      jsConsoleService.logStringMessage('getting Hdr');
#endif
      var messageHdr = messenger.msgHdrFromURI(dupeMessageRecords[i].uri)
#ifdef DEBUG_removeDuplicates
      jsConsoleService.logStringMessage('appending to removal Hdrs');
#endif
      removalMessageHdrs.AppendElement(messageHdr);
    }
  }
  
  if (removalMessageHdrs.Count() > 0) {
#ifdef DEBUG_removeDuplicates
      jsConsoleService.logStringMessage('getting folder');
#endif
    var firstMessageFolder = messenger.msgHdrFromURI(dupeMessageRecords[0].uri).folder;
    // if justMoveToTrash is true, this moves the messages to the trash fodler;
    // otherwise this deletes the messages permanently;
    // also there's the weird fact that you need to use a folder 
    // object to delete messages, but the messages don't have to be in that folder...
    // very intuitive right?
#ifdef DEBUG_removeDuplicates
      jsConsoleService.logStringMessage('deleting');
#endif
    firstMessageFolder.deleteMessages(
      removalMessageHdrs, msgWindow, !justMoveToTrah, false, null, true);
  }
#ifdef DEBUG_removeDuplicates
      jsConsoleService.logStringMessage('done');
#endif
}

//---------------------------------------------------------

function clone(myObject)
{
  if(typeof(myObject) != 'object')
    return myObject;
  if(myObject == null)
    return myObject;

  var newObject = new Object();

  for(var i in myObject)
    newObject[i] = clone(myObject[i]);

  return newObject;
}
