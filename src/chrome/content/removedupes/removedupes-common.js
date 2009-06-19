
// nsISupportsArray replaced with nsIArray by Mozilla bug 435290
var gUseSupportsArray;

var gCopyService =
  Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
            .getService(Components.interfaces.nsIMsgCopyService);

// localized strings

var gRemoveDupesStrings =
  Components.classes["@mozilla.org/intl/stringbundle;1"]
            .getService(Components.interfaces.nsIStringBundleService)
            .createBundle("chrome://removedupes/locale/removedupes.properties");

//---------------------------------------------------------

// General-purpose Javascript stuff

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

#ifdef DEBUG
var hD="0123456789ABCDEF";
// decimal to hexadecimal representation
function d2h(d) {
  var h = hD.substr(d&15,1);
  while(d>15) {d>>=4;h=hD.substr(d&15,1)+h;}
  return h;
}

function string2hex(str) {
  var res = "";
  for(i = 0; i < str.length-1; i++) {
    res += d2h(str.charCodeAt(i)) + " ";  
  }
  if (str.length > 0)
    res += d2h(str.charCodeAt(str.length-1));  
  return res;
}

function string2hexWithNewLines(str) {
  var res = "";
  for(i = 0; i < str.length-1; i++) {
    res += d2h(str.charCodeAt(i)) + " ";  
    if (str.charCodeAt(i) == 10)
      res += '\n';
  }
  if (str.length > 0)
    res += d2h(str.charCodeAt(str.length-1));  
  return res;
}

function busySleep(milliseconds)
{
  var date = new Date();
  var curDate = null;

  do {
    curDate = new Date();
  } while (curDate-date < milliseconds);
} 
#endif


//---------------------------------------------------------

function getBuildID() {
  var re = /rv:([0-9.]+).*Gecko\/([0-9]+)/;
  var arr = re.exec(navigator.userAgent);
  //var revision = arr[1];
  return arr[2];
}

function rdGetAppVersion()
{
  var versionString = 
    gRemoveDupesPrefs.prefService
                     .getBranch('extensions.')
                     .getCharPref('lastAppVersion');
  return versionString;
}

//---------------------------------------------------------

// Helper object for preferences

const preferencePrefix = "removedupes.";

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

  // nsIMsgCopyService no longer accepts nsISupportsArray's in recent versions;
  // I don't know how better to check that other than using the interface's UUID
  switch (Components.interfaces.nsIMsgCopyService.number) {
    case "{4010d881-6c83-4f8d-9332-d44564cee14a}":
    case "{f0ee3821-e382-43de-9b71-bd9a4a594fcb}":
    case "{c9255b88-5e0f-4614-8fdc-ebb97a0f333e}":
    case "{bce41600-28df-11d3-abf7-00805f8ac968}":
      gUseSupportsArray = true;
      break;
    default:
      // should be {f21e428b-73c5-4607-993b-d37325b33722} or later
      gUseSupportsArray = false;
  }
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
#ifdef DEBUG_removeDuplicates
          if (!messageHeader)
          jsConsoleService.logStringMessage('header is null for ' + messageRecord.uri);
#endif
          if (!(messageRecord.folderUri in dupesByFolderHashMap)) {
            var folderDupesInfo = new Object; 
            folderDupesInfo.folder = messageHeader.folder;
            folderDupesInfo.previousFolderUri = previousFolderUri;
            previousFolderUri = messageRecord.folderUri;
            folderDupesInfo.removalHeaders =
              (gUseSupportsArray ?
            // nsISupportsArray replaced with nsIArray by Mozilla bug 435290
               Components.classes["@mozilla.org/supports-array;1"]
                         .createInstance(Components.interfaces.nsISupportsArray) :
               Components.classes["@mozilla.org/array;1"]
                         .createInstance(Components.interfaces.nsIMutableArray) );

            dupesByFolderHashMap[messageRecord.folderUri] = folderDupesInfo;
          }
          // TODO: make sure using a weak reference is the right thing here
          if (gUseSupportsArray)
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
            (gUseSupportsArray ?
             Components.classes["@mozilla.org/supports-array;1"]
                       .createInstance(Components.interfaces.nsISupportsArray) :
             Components.classes["@mozilla.org/array;1"]
                       .createInstance(Components.interfaces.nsIMutableArray) );
          dupesByFolderHashMap[folderUri] = folderDupesInfo;
        }
        if (gUseSupportsArray)
          dupesByFolderHashMap[folderUri].removalHeaders.
            AppendElement(messageHeader);
        else 
          dupesByFolderHashMap[folderUri].removalHeaders.
            appendElement(messageHeader,false);
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
        true, // delete storage - what does this mean? 
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
  jsConsoleService.logStringMessage(
    'using supports? ' + (gUseSupportsArray ? 'yes' : 'no') + '\n' +
    'equals 4010d881-6c83-4f8d-9332-d44564cee14a? ' +
      (Components.interfaces.nsIMsgCopyService.equals(Components.ID("{4010d881-6c83-4f8d-9332-d44564cee14a}")) ? 'yes' : 'no') + '\n' +
    'equals f0ee3821-e382-43de-9b71-bd9a4a594fcb? ' +
      (Components.interfaces.nsIMsgCopyService.equals(Components.ID("{f0ee3821-e382-43de-9b71-bd9a4a594fcb}")) ? 'yes' : 'no') + '\n' +
    'gCopyService uuid = ' + Components.interfaces.nsIMsgCopyService.number + '\n' +
    'targetFolder URI = ' + targetFolder.URI + '\n' +
    'sourceFolder URI = ' + sourceFolder.URI + '\n' +
    'removalMessageHdrs has ' +
    (gUseSupportsArray ? removalMessageHdrs.Count() : removalMessageHdrs.length) +
    ' elements, first element is\n' +
    (gUseSupportsArray ? 
     removalMessageHdrs.GetElementAt(0) :
     removalMessageHdrs.queryElementAt(0,Components.interfaces.nsISupports)));
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
