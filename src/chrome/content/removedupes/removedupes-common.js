// XPCOM Shorthands

const Cc = Components.classes;
const Ci = Components.interfaces;


// localized strings

var gRemoveDupesStrings =
  Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Ci.nsIStringBundleService)
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

// This function is called either after the dupes are collected,
// without displaying the dialog, in which each element in the hash is
// an array of Uri's, or after displaying it, in which case the elements have
// been replaced with messageRecord objects (which also include indications
// of which messages to keep)
function removeDuplicates(dupeSetsHashMap,justMoveToTrah,haveMessageRecords)
{
  // note that messenger and msgWindow have to be defined! if we're running from the
  // overlay of the 3-pane window, then this is ensured; otherwise,
  // the dupes review dialog should have gotten it as a parameter
  // and set a global window-global variable of its own

#ifdef DEBUG_removeDuplicates
  jsConsoleService.logStringMessage('in removeDuplicates');
#endif

  var removalMessageHdrs =
    Cc["@mozilla.org/supports-array;1"].createInstance(Ci.nsISupportsArray);

  if (haveMessageRecords) {
    for ( var hashValue in dupeSetsHashMap ) {
      var dupeSet = dupeSetsHashMap[hashValue];
      for(var i = 0; i < dupeSet.length; i++) {
        if (!dupeSet[i].toKeep) {
#ifdef DEBUG_removeDuplicates
          jsConsoleService.logStringMessage('appending URI' + dupeSet[i].uri);
#endif
          removalMessageHdrs.AppendElement(messenger.msgHdrFromURI(dupeSet[i].uri));
        }
      }
    }
  }  
  else for ( var hashValue in dupeSetsHashMap ) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for(var i = 1; i < dupeSet.length; i++) {
#ifdef DEBUG_removeDuplicates
      jsConsoleService.logStringMessage('appending URI' + dupeSet[i]);
#endif
      removalMessageHdrs.AppendElement(messenger.msgHdrFromURI(dupeSet[i]));
    }
  }
  
  // can't figure out a better way to get some arbitrary URI
  for ( var hashValue in dupeSetsHashMap ) {
    var dupeSet = dupeSetsHashMap[hashValue];
    arbitraryUri = (haveMessageRecords ? dupeSet[0].uri : dupeSet[0]);
  }
    
  
  if (removalMessageHdrs.Count() > 0) {
#ifdef DEBUG_removeDuplicates
      jsConsoleService.logStringMessage('getting folder');
      jsConsoleService.logStringMessage('arbitraryUri = ' + arbitraryUri);
#endif
    var firstMessageFolder = messenger.msgHdrFromURI(arbitraryUri).folder;
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
