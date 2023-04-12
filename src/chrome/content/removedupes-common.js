var EXPORTED_SYMBOLS = ["RemoveDupes"];

const Cc = Components.classes;
const Ci = Components.interfaces;

const Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
const Preferences = ChromeUtils.import("resource://gre/modules/Preferences.jsm").Preferences;
const MailUtils = ChromeUtils.import("resource:///modules/MailUtils.jsm").MailUtils;

if ("undefined" == typeof(messenger)) {
  var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
}

var RemoveDupes = {};

try {
  // for some reason this is no longer defined recent Seamonkey trunk versions
  RemoveDupes.FolderFlags = {}
  RemoveDupes.FolderFlags.Inbox   =
    Components.interfaces.nsMsgFolderFlags.Inbox;
  RemoveDupes.FolderFlags.Virtual =
    Components.interfaces.nsMsgFolderFlags.Virtual;
  RemoveDupes.FolderFlags.Trash =
    Components.interfaces.nsMsgFolderFlags.Trash;
} catch(ex) {
  // constants from nsMsgFolderFlags.idl
  RemoveDupes.FolderFlags.Inbox   = 0x1000;
  RemoveDupes.FolderFlags.Virtual = 0x0020;
  RemoveDupes.FolderFlags.Trash   = 0x0100;
};

RemoveDupes.MessageStatusFlags = {
  READ:            0x00000001,
  REPLIED:         0x00000002,
  MARKED:          0x00000004,
  EXPUNGED:        0x00000008,
  HAS_RE:          0x00000010,
  ELIDED:          0x00000020,
  FEED_MSG:        0x00000040,
  OFFLINE:         0x00000080,
  WATCHED:         0x00000100,
  SENDER_AUTHED:   0x00000200,
  PARTIAL:         0x00000400,
  QUEUED:          0x00000800,
  FORWARDED:       0x00001000,
//  PRIORITIES:      0x0000E000,
//  NEW:             0x00010000,
//  THREAD_IGNORED:  0x00040000,
  IMAP_DELETED:    0x00200000,
//  MDN_REPORT_NEEDED: 0x00400000,
//  MDN_REPORT_SENT: 0x00800000,
  IS_TEMPLATE:     0x01000000,
  HAS_ATTACHMENTS: 0x10000000
// LABELS:         0x0E000000;
};

RemoveDupes.__defineGetter__("FolderLookupService", function() {
  delete RemoveDupes.FolderLookupService;
  return RemoveDupes.FolderLookupService =
    Components.classes['@mozilla.org/mail/folder-lookup;1']
              .getService(Components.interfaces.nsIFolderLookupService);
  });



RemoveDupes.GetMsgFolderFromUri = function(uri, checkFolderAttributes) {
  let messageFolder = null;

  try {
    messageFolder = RemoveDupes.FolderLookupService.getFolderForURL(uri);
  } catch(ex) { 
#ifdef DEBUG_GetMsgFolderFromUri
      console.log('RemoveDupes.FolderLookupService.getFolderForURL(' + uri + ') failed:\n' + ex);
#endif
  }
  if (messageFolder != null) { 
#ifdef DEBUG_GetMsgFolderFromUri
      console.log('got folder from URI with RemoveDupes.folderLookup.getFolderForURL(' + uri + ')');
#endif
    return messageFolder; 
}

  if (typeof MailUtils != 'undefined' && MailUtils.getFolderForURI) {
    return MailUtils.getFolderForURI(uri, checkFolderAttributes);
  }
  try {
    let resource = GetResourceFromUri(uri);
    messageFolder = resource.QueryInterface(Components.interfaces.nsIMsgFolder);
    if (checkFolderAttributes) {
      if (!(messageFolder && (messageFolder.parent || messageFolder.isServer))) {
        messageFolder = null;
      }
    }
  }
  catch (ex)  {
#ifdef DEBUG_GetMsgFolderFromUri
      console.log('Failed obtaining a message folder object using the folder URI ' + uri + ' :\n' + ex);
#endif
  }
  return messageFolder;
};

RemoveDupes.showNotification = function(appWindow, notificationName) {
  let text = RemoveDupes.Strings.getByName(notificationName);
  let title = RemoveDupes.Strings.getByName("title");
  try { 
    let alertsService =
      Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
    alertsService.showAlertNotification(
      null, // no image
      title,
      text);
  } catch(e) {
    // Thunderbird probably doesn't support nsIAlertsService, let's try
    // the old-flashied way - a model alert
    appWindow.alert(title + ":\n" + text);
  }
}

RemoveDupes.namedAlert = function(appWindow, alertName) {
  let text = RemoveDupes.Strings.getByName(alertName);
  let title = RemoveDupes.Strings.getByName("title");
  Services.prompt.alert(appWindow, title, text);
}

//---------------------------------------------------------

// Extension-Global Variables
// --------------------------


#ifdef DEBUG
  // used for rough profiling
  RemoveDupes.StartTime,
  RemoveDupes.EndTime,
#endif

// localized strings
RemoveDupes.Strings = {
#expand   prefix : '__SHORTNAME__.',
  getByName: function(stringName) {
    return this.Bundle.GetStringFromName(this.prefix + stringName);
  },
  format: function(stringName, argsToFormat) {
	return (RemoveDupes.App.versionIsAtLeast("69")) ?
	  this.Bundle.formatStringFromName(this.prefix + stringName, argsToFormat) :
      this.Bundle.formatStringFromName(this.prefix + stringName, argsToFormat, argsToFormat.length);
  }
}

RemoveDupes.Strings.__defineGetter__("Bundle", function() {
  delete this.Bundle;
  return this.Bundle =
      Services.strings.createBundle("chrome://removedupes/locale/removedupes.properties");
});

//---------------------------------------------------------

RemoveDupes.App = {

  getBuildID : function () {
    var re = /rv:([0-9.]+).*Gecko\/([0-9]+)/;
    var arr = re.exec(navigator.userAgent);
    //var revision = arr[1];
    return arr[2];
  },

  // returns true if the app version is equal-or-higher to minVersion, false otherwise;
  ensureVersion : function(versionThreshold, checkMinimum) {
    var versionCheckResult = Services.vc.compare(Services.appinfo.version, versionThreshold);
    return (   (checkMinimum  && (versionCheckResult >= 0))
            || (!checkMinimum && (versionCheckResult <= 0)));
  },

  versionIsAtLeast : function(minVersion) {
  	return this.ensureVersion(minVersion, true);
  },

  versionIsAtMost : function(maxVersion) {
  	return this.ensureVersion(maxVersion, false);
  }
}

//---------------------------------------------------------

// Preferences
// -----------

RemoveDupes.__defineGetter__("Prefs", function() {
    delete RemoveDupes.Prefs;
    return RemoveDupes.Prefs = new Preferences("extensions.removedupes.");
});

//---------------------------------------------------------

RemoveDupes.Removal = {
  
  getLocalFoldersTrashFolder : function() {
    let result = null;
    try {
      let accountManager =
        Components.classes["@mozilla.org/messenger/account-manager;1"]
          .getService(Components.interfaces.nsIMsgAccountManager);
      var rootFolder = 
        accountManager.localFoldersServer.rootFolder;
      result = rootFolder.getFolderWithFlags(RemoveDupes.FolderFlags.Trash);
    } catch(ex) {
      // We did our best... let's just return _something_
#ifdef DEBUG_getLocalFoldersTrashFolder
      console.log('couldn\'t get local trash folder: ' + ex);
#endif
    }
    if (!result || result == "") {
      return 'mailbox://nobody@Local%20Folders/Trash';
    }
    return result;
  },

  // This function is called from removeDuplicateMessageas,
  // either after the dupes are collected,
  // without displaying the dialog, in which case each element in the hash is
  // an array of Uri's and haveMessageRecords is false, or after displaying the
  // dialog, in which case the elements have been replaced with messageRecord 
  // objects (which also include indications of which messages to keep)

  createDupesByFolderHashMap : function(
    dupeSetsHashMap,haveMessageRecords) {

    var dupesByFolderHashMap = new Object;
    var messageHeader;
    var previousFolderUri = null;
    let usePlainArrayForremovalHeaders = RemoveDupes.App.versionIsAtLeast("79.0");
    let arrayAppendFunctionName = usePlainArrayForremovalHeaders ? 'push' : 'appendElement';

    for (let hashValue in dupeSetsHashMap) {
      var dupeSet = dupeSetsHashMap[hashValue];
#ifdef DEBUG_removeDuplicates
      console.log('hash value ' +
        hashValue + '\nnumber of dupes: ' + dupeSet.length);
#endif
      if (haveMessageRecords) {
        for (let i = 0; i < dupeSet.length; i++) {
          var messageRecord = dupeSet[i];
          if (!messageRecord.toKeep) {
#ifdef DEBUG_removeDuplicates
            console.log('processing URI ' +
              messageRecord.uri);
#endif
            messageHeader = messenger.msgHdrFromURI(messageRecord.uri);
#ifdef DEBUG_removeDuplicates
            if (!messageHeader)
              console.log('header is null for ' +
              messageRecord.uri);
#endif
            if (!(messageRecord.folderUri in dupesByFolderHashMap)) {
              var folderDupesInfo = new Object; 
              folderDupesInfo.folder = messageHeader.folder;
              folderDupesInfo.previousFolderUri = previousFolderUri;
              previousFolderUri = messageRecord.folderUri;
              folderDupesInfo.removalHeaders = usePlainArrayForremovalHeaders ?
                new Array :
                Components.classes["@mozilla.org/array;1"]
                          .createInstance(Components.interfaces.nsIMutableArray);

              dupesByFolderHashMap[messageRecord.folderUri] = folderDupesInfo;
            }
            // TODO: make sure using a weak reference is the right thing here
            dupesByFolderHashMap[messageRecord.folderUri].removalHeaders[arrayAppendFunctionName](messageHeader);
          }
        }
      }
      else {
        for (let i = 1; i < dupeSet.length; i++) {
#ifdef DEBUG_removeDuplicates
          console.log('processing URI ' + dupeSet[i]);
#endif
          messageHeader = messenger.msgHdrFromURI(dupeSet[i]);
          var folderUri = messageHeader.folder.URI;
          if (!dupesByFolderHashMap[folderUri]) {
            var folderDupesInfo = new Object;
            folderDupesInfo.folder = messageHeader.folder;
            folderDupesInfo.previousFolderUri = previousFolderUri;
            previousFolderUri = folderUri;
            folderDupesInfo.removalHeaders = usePlainArrayForremovalHeaders ?
                new Array :
                Components.classes["@mozilla.org/array;1"];
            dupesByFolderHashMap[folderUri] = folderDupesInfo;
          }
          dupesByFolderHashMap[folderUri].removalHeaders[arrayAppendFunctionName](messageHeader);
        }
      }
    }
    return dupesByFolderHashMap;
  },

  //
  // removeDuplicates() returns...
  //
  //   true   if all requested deletions were performed 
  //   false  if no deletions were performed or none were requested
  //   null   if some deletions were performed but some failed or were
  //          aborted
  //
  // Also, see createDupesByFolderHashMap for explanation regarding 
  // the haveMessageRecords parameter
  removeDuplicates : function(
    appWindow,
    msgWindow,
    dupeSetsHashMap,
    deletePermanently,
    confirmPermanentDeletion,
    targetFolderUri,
    haveMessageRecords) {
    // note that messenger and msgWindow have to be defined! if we're running from the
    // overlay of the 3-pane window, then this is ensured; otherwise,
    // the dupes review dialog should have gotten it as a parameter
    // and set a window-global variable of its own

#ifdef DEBUG_removeDuplicates
    console.log(
      'in removeDuplicates\ntargetFolderUri = ' + targetFolderUri +
      '\ndeletePermanently = ' + deletePermanently);
#endif

    var targetFolder;
    if (!deletePermanently) {
      if ((targetFolderUri == null) || (targetFolderUri == "")) {
        targetFolder = getLocalFoldersTrashFolder().URI;
      }
      else targetFolder = RemoveDupes.GetMsgFolderFromUri(targetFolderUri, true);
      if (!targetFolder) {
        // TODO: Make namedAlert perform formatting if it gets a non-null, non-empty third argument
        appWindow.alert(RemoveDupes.Strings.format('no_such_folder', [targetFolderUri]));
        return false;
      }
    }
#ifdef DEBUG_removeDuplicates
    console.log('trgetFolder: ' + targetFolder);
#endif

    var dupesByFolderHashMap =
      RemoveDupes.Removal.createDupesByFolderHashMap(
        dupeSetsHashMap,haveMessageRecords);

    var any_deletions_performed = false;
    var any_deletions_failed_or_aborted = false;
    for (let folderUri in dupesByFolderHashMap) {
      var retVal = 
        RemoveDupes.Removal.removeDupesFromSingleFolder(
          appWindow,
          msgWindow,
          dupesByFolderHashMap[folderUri].folder,
          dupesByFolderHashMap[folderUri].removalHeaders,
          targetFolder,
          deletePermanently,
          confirmPermanentDeletion);
      any_deletions_failed_or_aborted = any_deletions_failed_or_aborted || (!retVal);
      any_deletions_performed = any_deletions_performed || (!!retVal);
    }
#ifdef DEBUG_removeDuplicates
    console.log('Done. ' +
      'any_deletions_performed ? ' + any_deletions_performed + '; ' +
      'any_deletions_failed_or_aborted ? ' + any_deletions_performed);
#endif
    if (any_deletions_performed && any_deletions_failed_or_aborted) {
      return null;
    }
    if (!any_deletions_performed && any_deletions_failed_or_aborted) {
      return false;
    }
    if (any_deletions_performed && !any_deletions_failed_or_aborted) {
      return true;
    }
    throw Components.results.NS_ERROR_UNEXPECTED;
  },

  // if this returns false, something's amiss (currently an abortion)
  // and the deletion should not go on.
  removeDupesFromSingleFolder : function(
    appWindow,
    msgWindow,
    sourceFolder,
    removalMessageHdrs,
    targetFolder,
    deletePermanently,
    confirmPermanentDeletion) {
    if (deletePermanently) {
      try {
        if (confirmPermanentDeletion) {
          var numMessagesToDelete = removalMessageHdrs.length;
          var message = RemoveDupes.Strings.format('confirm_permanent_deletion_from_folder', [numMessagesToDelete ,sourceFolder.abbreviatedName]);
          if (!appWindow.confirm(message)) {
            appWindow.alert(RemoveDupes.Strings.getByName('deletion_aborted'));
            return false;
          }
        }

        sourceFolder.deleteMessages(
          removalMessageHdrs, 
          msgWindow,
          true, // delete permanently
          true, // delete storage - what does this mean? 
          null, // no listener
          true // allow undo... will this be possible at all?
        );
      } catch(ex) {
        appWindow.alert(RemoveDupes.Strings.getByName('failed_to_erase'));
        throw(ex);
      }
      return true;
    }
    else {
      try {
        let copyService =
          Components.classes["@mozilla.org/messenger/messagecopyservice;1"]
            .getService(Components.interfaces.nsIMsgCopyService);
		// The copy function name dropped the inital capital sometime between TB 78 and TB 91
		let copyFunctionName =  ('copyMessages' in copyService) ? 'copyMessages' : 'CopyMessages';
        copyService[copyFunctionName](
            sourceFolder,
            removalMessageHdrs,
            targetFolder,
            true, // moving, not copying
            null, // no listener
            msgWindow,
            true // allow undo
          )
      } catch(ex) {
        appWindow.alert(RemoveDupes.Strings.format('failed_to_move_to_folder', [targetFolder.URI]));
        throw(ex);
      }
      return true;
    }
  }
}

