// A way to tell if an object is empty or not

function isEmpty(obj)
{
  var i;
  if (typeof obj === 'object' || typeof obj === 'function') {
    for (i in obj) {
      if (obj.hasOwnProperty(i)) {
        return false;
      }
    }
  }
  return true;
}

var gCopyService =
  Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
            .getService(Components.interfaces.nsIMsgCopyService);

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

  getLocalizedStringPref: function(prefName, defaultValue) {
    try {
      return this.prefService
                 .getComplexValue(
                   preferencePrefix + prefName,Components.interfaces.nsIPrefLocalizedString).data;
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
  
  setLocalizedStringPref: function (prefName, val) {
    var pls = Components.classes["@mozilla.org/pref-localizedstring;1"]
                        .createInstance(Components.interfaces.nsIPrefLocalizedString);
    pls.data = val;
    this.prefService
        .setComplexValue(
          preferencePrefix + prefName,Components.interfaces.nsIPrefLocalizedString, pls);
  }

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
function removeDuplicates(
  dupeSetsHashMap,
  deletePermanently,
  targetFolderUri,
  haveMessageRecords)
{
  // note that messenger and msgWindow have to be defined! if we're running from the
  // overlay of the 3-pane window, then this is ensured; otherwise,
  // the dupes review dialog should have gotten it as a parameter
  // and set a global window-global variable of its own

#ifdef DEBUG_removeDuplicates
  jsConsoleService.logStringMessage('in removeDuplicates\ntargetFolderUri = ' + targetFolderUri + '\ndeletePermanently = ' + deletePermanently);
#endif

  var targetFolder;
  if (!deletePermanently) {
    if ((targetFolderUri == null) || (targetFolderUri == ""))
      targetFolderUri = 'mailbox://nobody@Local%20Folders/Trash';
    targetFolder = GetMsgFolderFromUri(targetFolderUri, true);
    if (!targetFolder) {
      alert(gRemoveDupesStrings.formatStringFromName('removedupes.no_such_folder', [targetFolderUri], 1));
      return;
    }
  }
  
  // TODO: re-hash the messages by folder, then delete all messages in a folder at once
  
  var dupesByFolderHashMap = new Object;
  var messageHeader;
  var previousFolderUri = null;
  
  for (var hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
#ifdef DEBUG_removeDuplicates
    jsConsoleService.logStringMessage('hash value ' + hashValue + '\nnumber of dupes: ' + dupeSet.length);
#endif
    if (haveMessageRecords) {
      for(var i = 0; i < dupeSet.length; i++) {
        messageRecord = dupeSet[i];
        if (!messageRecord.toKeep) {
#ifdef DEBUG_removeDuplicates
          jsConsoleService.logStringMessage('processing URI ' + messageRecord.uri);
#endif
          messageHeader = messenger.msgHdrFromURI(messageRecord.uri);
          if (!(messageRecord.folderUri in dupesByFolderHashMap)) {
            var folderDupesInfo = new Object; 
            folderDupesInfo.folder = messageHeader.folder;
            folderDupesInfo.previousFolderUri = previousFolderUri;
            previousFolderUri = messageRecord.folderUri;
            folderDupesInfo.removalHeaders =
              Components.classes["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
            dupesByFolderHashMap[messageRecord.folderUri] = folderDupesInfo;
          }
          dupesByFolderHashMap[messageRecord.folderUri]
            .removalHeaders.AppendElement(messageHeader);
        }
      }
    }
    else {
      for(var i = 1; i < dupeSet.length; i++) {
#ifdef DEBUG_removeDuplicates
        jsConsoleService.logStringMessage('processing URI ' + dupeSet[i]);
#endif
        messageHeader = messenger.msgHdrFromURI(dupeSet[i]);
        var folderUri = messageHeader.folder.URI;
        if (!dupesByFolderHashMap[folderUri]) {
          var folderDupesInfo = new Object;
          folderDupesInfo.folder = messageHeader.folder;
          folderDupesInfo.previousFolderUri = previousFolderUri;
          previousFolderUri = folderUri;
          folderDupesInfo.removalHeaders =
            Components.classes["@mozilla.org/supports-array;1"].createInstance(Components.interfaces.nsISupportsArray);
          dupesByFolderHashMap[folderUri] = folderDupesInfo;
        }
        dupesByFolderHashMap[folderUri]
            .removalHeaders.AppendElement(messageHeader);
      }
    }
  }


  for (folderUri in dupesByFolderHashMap) {
    removeDupesFromSingleFolder(
      dupesByFolderHashMap[folderUri].folder,
      dupesByFolderHashMap[folderUri].removalHeaders,
      targetFolder,
      deletePermanently);
  }

#ifdef DEBUG_removeDuplicates
  jsConsoleService.logStringMessage('done');
#endif
}

function removeDupesFromSingleFolder(
  sourceFolder,
  removalMessageHdrs,
  targetFolder,
  deletePermanently)
{
#ifdef DEBUG_removeDuplicates
//  jsConsoleService.logStringMessage('removalMessageHdrs.GetElementAt(0) = ' + removalMessageHdrs.GetElementAt(0));
#endif
  if (deletePermanently) {
    try{
      sourceFolder.deleteMessages(
        removalMessageHdrs, 
        msgWindow,
        true, // delete permanently
        false, // delete storage - what does this mean? 
        null, // no listener
        true // allow undo... will this be possible at all?
        );
    } catch(ex) {
      alert(gRemoveDupesStrings.GetStringFromName('removedupes.failed_to_erase'));
      throw(ex);
    }
  }
  else {
    try {
#ifdef DEBUG_removeDuplicates
  jsConsoleService.logStringMessage('targetFolder URI = ' + targetFolder.URI + '\nsourceFolder URI = ' + sourceFolder.URI +
                                    '\nremovalMessageHdrs has ' + removalMessageHdrs.Count() + ' elements, first element is\n' +
                                    removalMessageHdrs.GetElementAt(0));
  
#endif
      gCopyService.CopyMessages(
        sourceFolder,
        removalMessageHdrs,
        targetFolder,
        true, // moving, not copying
        null, // no listener
        msgWindow,
        true // allow undo... what does this mean exactly?
        );
    } catch(ex) {
      alert(gRemoveDupesStrings.formatStringFromName('removedupes.failed_to_move_to_folder', [targetFolder.URI], 1));
      throw(ex);
    }
  }
}
