//uncomment the following when this file becomes a module
//var EXPORTED_SYMBOLS = [ "RemoveDupes" ];

if ("undefined" == typeof(RemoveDupes)) {
  var RemoveDupes = {};
};

//---------------------------------------------------------

// Extension-Global Variables
// --------------------------

#ifdef DEBUG
// The following enables logging messages to the javascript console:
RemoveDupes.__defineGetter__("JSConsoleService", function() {
  delete RemoveDupes.JSConsoleService;
  return RemoveDupes.JSConsoleService =
    Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService);
  });
#endif

// nsISupportsArray was replaced with nsIArray; see Mozilla bug 435290
RemoveDupes.UseSupportsArray = null,

// localized strings
RemoveDupes.Strings =
  Cc["@mozilla.org/intl/stringbundle;1"]
    .getService(Ci.nsIStringBundleService)
    .createBundle("chrome://removedupes/locale/removedupes.properties");

#ifdef DEBUG
  // used for rough profiling
  RemoveDupes.StartTime,
  RemoveDupes.EndTime,
#endif


//---------------------------------------------------------

// General-purpose Javascript stuff

RemoveDupes.JS = {

  // A way to tell if an object is empty or not
  isEmpty: function(obj) {
    var i;
    if (typeof obj === 'object' || typeof obj === 'function') {
      for (i in obj) {
        if (obj.hasOwnProperty(i)) {
          return false;
        }
      }
    }
    return true;
  },

#ifdef DEBUG
  hD : "0123456789ABCDEF",
  // decimal to hexadecimal representation
  d2h : function(d) {
   var h = this.hD.substr(d&15,1);
    while(d>15) {d>>=4;h=hD.substr(d&15,1)+h;}
    return h;
  },

  string2hex : function(str) {
    var res = "";
    for(i = 0; i < str.length-1; i++) {
      res += this.d2h(str.charCodeAt(i)) + " ";  
    }
    if (str.length > 0)
      res += this.d2h(str.charCodeAt(str.length-1));  
    return res;
  },

  string2hexWithNewLines : function (str) {
    var res = "";
    for(i = 0; i < str.length-1; i++) {
      res += this.d2h(str.charCodeAt(i)) + " ";  
      if (str.charCodeAt(i) == 10)
        res += '\n';
    }
    if (str.length > 0)
      res += this.d2h(str.charCodeAt(str.length-1));  
    return res;
  },

#endif
}

//---------------------------------------------------------

RemoveDupes.App = {

  getBuildID : function () {
    var re = /rv:([0-9.]+).*Gecko\/([0-9]+)/;
    var arr = re.exec(navigator.userAgent);
    //var revision = arr[1];
    return arr[2];
  },

  ensureMinimumVersion : function(minVersion) {
    var version;  
    if ("@mozilla.org/xre/app-info;1" in Cc ) {
      version = 
        Cc["@mozilla.org/xre/app-info;1"]
                  .getService(Ci.nsIXULAppInfo).version;  
    }
    else {
      version =
         Cc["@mozilla.org/preferences-service;1"]
                  .getService(Ci.nsIPrefBranch)
                  .getCharPref("extensions.lastAppVersion");  
    }
    var versionChecker =
      Cc["@mozilla.org/xpcom/version-comparator;1"]
                .getService(Ci.nsIVersionComparator);  
     
    return ( versionChecker.compare( version, minVersion ) >= 0 )  
  }
}

//---------------------------------------------------------

// Preferences
// -----------

RemoveDupes.Prefs = {

  // const
  preferencePrefix : "removedupes.",

  _prefService: null,

  get prefService()
  {
    if (!this._prefService) 
      this._prefService =
        Cc["@mozilla.org/preferences-service;1"]
                  .getService(Ci.nsIPrefBranch);
    return this._prefService;
  },

  getBoolPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getBoolPref(
        RemoveDupes.Prefs.preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getCharPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getCharPref(
        RemoveDupes.Prefs.preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getIntPref: function(prefName, defaultValue) {
    try {
      return this.prefService.getIntPref(
        RemoveDupes.Prefs.preferencePrefix + prefName);
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  getLocalizedStringPref: function(prefName, defaultValue) {
    try {
      return this.prefService
                 .getComplexValue(
                   RemoveDupes.Prefs.preferencePrefix +
                   prefName,Ci.nsIPrefLocalizedString).data;
    } catch(ex) {
      if (defaultValue != undefined)
        return defaultValue;

      throw(ex);
    }
  },

  setBoolPref: function(prefName, val) {
    this.prefService.setBoolPref(RemoveDupes.Prefs.preferencePrefix + prefName, val);
  },

  setCharPref: function(prefName, val) {
    this.prefService.setCharPref(RemoveDupes.Prefs.preferencePrefix + prefName, val);
  },

  setIntPref: function(prefName, val) {
    this.prefService.setIntPref(RemoveDupes.Prefs.preferencePrefix + prefName, val);
  },
  
  setLocalizedStringPref: function (prefName, val) {
    var pls = Cc["@mozilla.org/pref-localizedstring;1"]
                        .createInstance(Ci.nsIPrefLocalizedString);
    pls.data = val;
    this.prefService
        .setComplexValue(
          RemoveDupes.Prefs.preferencePrefix +
          prefName,Ci.nsIPrefLocalizedString, pls);
  }

}

//---------------------------------------------------------

RemoveDupes.Removal = {
  
  getLocalFoldersTrashFolder : function() {
    var accountManager =
      Cc["@mozilla.org/messenger/account-manager;1"]
        .getService(Ci.nsIMsgAccountManager);
    return accountManager.localFoldersServer
                         .rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  },

  // This function is called either after the dupes are collected,
  // without displaying the dialog, in which each element in the hash is
  // an array of Uri's, or after displaying it, in which case the elements have
  // been replaced with messageRecord objects (which also include indications
  // of which messages to keep)
  removeDuplicates : function(
    dupeSetsHashMap,
    deletePermanently,
    targetFolderUri,
    haveMessageRecords) {
    // note that messenger and msgWindow have to be defined! if we're running from the
    // overlay of the 3-pane window, then this is ensured; otherwise,
    // the dupes review dialog should have gotten it as a parameter
    // and set a global window-global variable of its own

#ifdef DEBUG_removeDuplicates
    RemoveDupes.JSConsoleService.logStringMessage('in removeDuplicates\ntargetFolderUri = ' + targetFolderUri + '\ndeletePermanently = ' + deletePermanently);
#endif

    // nsIMsgCopyService no longer accepts nsISupportsArray's in recent versions;
    // I don't know how better to check that other than using the interface's UUID
    switch (Ci.nsIMsgCopyService.number) {
      case "{4010d881-6c83-4f8d-9332-d44564cee14a}":
      case "{f0ee3821-e382-43de-9b71-bd9a4a594fcb}":
      case "{c9255b88-5e0f-4614-8fdc-ebb97a0f333e}":
      case "{bce41600-28df-11d3-abf7-00805f8ac968}":
        RemoveDupes.UseSupportsArray = true;
        break;
      default:
        // should be {f21e428b-73c5-4607-993b-d37325b33722} or later
        RemoveDupes.UseSupportsArray = false;
    }
    var targetFolder;
    if (!deletePermanently) {
      if ((targetFolderUri == null) || (targetFolderUri == "")) {
        targetFolder = getLocalFoldersTrashFolder().URI;
      }
      else targetFolder = GetMsgFolderFromUri(targetFolderUri, true);
      if (!targetFolder) {
        alert(RemoveDupes.Strings.formatStringFromName('removedupes.no_such_folder', [targetFolderUri], 1));
        return;
      }
    }

    var dupesByFolderHashMap = new Object;
    var messageHeader;
    var previousFolderUri = null;

    for (var hashValue in dupeSetsHashMap) {
      var dupeSet = dupeSetsHashMap[hashValue];
#ifdef DEBUG_removeDuplicates
      RemoveDupes.JSConsoleService.logStringMessage('hash value ' + hashValue + '\nnumber of dupes: ' + dupeSet.length);
#endif
      if (haveMessageRecords) {
        for(var i = 0; i < dupeSet.length; i++) {
    messageRecord = dupeSet[i];
    if (!messageRecord.toKeep) {
#ifdef DEBUG_removeDuplicates
      RemoveDupes.JSConsoleService.logStringMessage('processing URI ' + messageRecord.uri);
#endif
      messageHeader = messenger.msgHdrFromURI(messageRecord.uri);
#ifdef DEBUG_removeDuplicates
      if (!messageHeader)
      RemoveDupes.JSConsoleService.logStringMessage('header is null for ' + messageRecord.uri);
#endif
      if (!(messageRecord.folderUri in dupesByFolderHashMap)) {
        var folderDupesInfo = new Object; 
        folderDupesInfo.folder = messageHeader.folder;
        folderDupesInfo.previousFolderUri = previousFolderUri;
        previousFolderUri = messageRecord.folderUri;
        folderDupesInfo.removalHeaders =
          (RemoveDupes.UseSupportsArray ?
        // nsISupportsArray replaced with nsIArray by Mozilla bug 435290
           Cc["@mozilla.org/supports-array;1"]
         .createInstance(Ci.nsISupportsArray) :
           Cc["@mozilla.org/array;1"]
         .createInstance(Ci.nsIMutableArray) );

        dupesByFolderHashMap[messageRecord.folderUri] = folderDupesInfo;
      }
      // TODO: make sure using a weak reference is the right thing here
      if (RemoveDupes.UseSupportsArray)
        dupesByFolderHashMap[messageRecord.folderUri].removalHeaders.
          AppendElement(messageHeader);
      else 
        dupesByFolderHashMap[messageRecord.folderUri].removalHeaders.
          appendElement(messageHeader,false);
    }
        }
      }
      else {
        for(var i = 1; i < dupeSet.length; i++) {
#ifdef DEBUG_removeDuplicates
    RemoveDupes.JSConsoleService.logStringMessage('processing URI ' + dupeSet[i]);
#endif
    messageHeader = messenger.msgHdrFromURI(dupeSet[i]);
    var folderUri = messageHeader.folder.URI;
    if (!dupesByFolderHashMap[folderUri]) {
      var folderDupesInfo = new Object;
      folderDupesInfo.folder = messageHeader.folder;
      folderDupesInfo.previousFolderUri = previousFolderUri;
      previousFolderUri = folderUri;
      folderDupesInfo.removalHeaders =
        (RemoveDupes.UseSupportsArray ?
         Cc["@mozilla.org/supports-array;1"]
             .createInstance(Ci.nsISupportsArray) :
         Cc["@mozilla.org/array;1"]
             .createInstance(Ci.nsIMutableArray) );
      dupesByFolderHashMap[folderUri] = folderDupesInfo;
    }
    if (RemoveDupes.UseSupportsArray)
      dupesByFolderHashMap[folderUri].removalHeaders.
        AppendElement(messageHeader);
    else 
      dupesByFolderHashMap[folderUri].removalHeaders.
        appendElement(messageHeader,false);
        }
      }
    }
    for (folderUri in dupesByFolderHashMap) {
      RemoveDupes.Removal.removeDupesFromSingleFolder(
        dupesByFolderHashMap[folderUri].folder,
        dupesByFolderHashMap[folderUri].removalHeaders,
        targetFolder,
        deletePermanently);
    }
#ifdef DEBUG_removeDuplicates
    RemoveDupes.JSConsoleService.logStringMessage('done');
#endif
  },

  removeDupesFromSingleFolder : function(
    sourceFolder,
    removalMessageHdrs,
    targetFolder,
    deletePermanently) {
#ifdef DEBUG_removeDuplicates
  //  RemoveDupes.JSConsoleService.logStringMessage('removalMessageHdrs.GetElementAt(0) = ' + removalMessageHdrs.GetElementAt(0));
#endif
    if (deletePermanently) {
      try{
        sourceFolder.deleteMessages(
          removalMessageHdrs, 
          msgWindow,
          true, // delete permanently
          true, // delete storage - what does this mean? 
          null, // no listener
          true // allow undo... will this be possible at all?
        );
      } catch(ex) {
        alert(RemoveDupes.Strings.GetStringFromName('removedupes.failed_to_erase'));
        throw(ex);
      }
    }
    else {
      try {
#ifdef DEBUG_removeDuplicates
    RemoveDupes.JSConsoleService.logStringMessage(
      'using supports? ' + (RemoveDupes.UseSupportsArray ? 'yes' : 'no') + '\n' +
      'equals 4010d881-6c83-4f8d-9332-d44564cee14a? ' +
        (Ci.nsIMsgCopyService.equals(Components.ID("{4010d881-6c83-4f8d-9332-d44564cee14a}")) ? 'yes' : 'no') + '\n' +
      'equals f0ee3821-e382-43de-9b71-bd9a4a594fcb? ' +
        (Ci.nsIMsgCopyService.equals(Components.ID("{f0ee3821-e382-43de-9b71-bd9a4a594fcb}")) ? 'yes' : 'no') + '\n' +
      'gCopyService uuid = ' + Ci.nsIMsgCopyService.number + '\n' +
      'targetFolder URI = ' + targetFolder.URI + '\n' +
      'sourceFolder URI = ' + sourceFolder.URI + '\n' +
      'removalMessageHdrs has ' +
      (RemoveDupes.UseSupportsArray ? removalMessageHdrs.Count() : removalMessageHdrs.length) +
      ' elements, first element is\n' +
      (RemoveDupes.UseSupportsArray ? 
       removalMessageHdrs.GetElementAt(0) :
       removalMessageHdrs.queryElementAt(0,Ci.nsISupports)));
#endif
       var copyService =
         Cc["@mozilla.org/messenger/messagecopyservice;1"]
           .getService(Ci.nsIMsgCopyService);
       copyService.CopyMessages(
          sourceFolder,
          removalMessageHdrs,
          targetFolder,
          true, // moving, not copying
          null, // no listener
          msgWindow,
          true // allow undo... what does this mean exactly?
        );
      } catch(ex) {
        alert(RemoveDupes.Strings.formatStringFromName('removedupes.failed_to_move_to_folder', [targetFolder.URI], 1));
        throw(ex);
      }
    }
  }
}
