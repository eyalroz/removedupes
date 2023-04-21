var EXPORTED_SYMBOLS = ["RemoveDupes"];
var RemoveDupes = {};

const Cc = Components.classes;
const Ci = Components.interfaces;

const Services    = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
const MailServices = ChromeUtils.import("resource:///modules/MailServices.jsm").MailServices;
const Preferences  = ChromeUtils.import("resource://gre/modules/Preferences.jsm").Preferences;
const MailUtils    = ChromeUtils.import("resource:///modules/MailUtils.jsm").MailUtils;
const XPCOMUtils   = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm").XPCOMUtils;

/* eslint-disable */
if (typeof messenger == 'undefined') {
  var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
}
/* eslint-enable */


try {
  // for some reason this is no longer defined recent Seamonkey trunk versions
  RemoveDupes.FolderFlags = {};
  RemoveDupes.FolderFlags.Inbox   = Components.interfaces.nsMsgFolderFlags.Inbox;
  RemoveDupes.FolderFlags.Virtual = Components.interfaces.nsMsgFolderFlags.Virtual;
  RemoveDupes.FolderFlags.Trash   = Components.interfaces.nsMsgFolderFlags.Trash;
} catch (ex) {
  // constants from nsMsgFolderFlags.idl
  RemoveDupes.FolderFlags.Inbox   = 0x1000;
  RemoveDupes.FolderFlags.Virtual = 0x0020;
  RemoveDupes.FolderFlags.Trash   = 0x0100;
}

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

XPCOMUtils.defineLazyServiceGetter(
    RemoveDupes, 'AlertsService', '@mozilla.org/alerts-service;1', 'nsIAlertsService');

RemoveDupes.showNotification = function (appWindow, notificationName) {
  let text = RemoveDupes.Strings.getByName(notificationName);
  let title = RemoveDupes.Strings.getByName("title");
  try {
    RemoveDupes.AlertsService.showAlertNotification(
      null, // no image
      title,
      text);
  } catch (e) {
    // Thunderbird probably doesn't support nsIAlertsService, let's try
    // the old-flashied way - a model alert
    appWindow.alert(title + ":\n" + text);
  }
}

RemoveDupes.namedAlert = function (appWindow, alertName) {
  let text = RemoveDupes.Strings.getByName(alertName);
  let title = RemoveDupes.Strings.getByName("title");
  Services.prompt.alert(appWindow, title, text);
}

//---------------------------------------------------------

// Localized strings

RemoveDupes.Strings = {};
RemoveDupes.Strings.prefix = 'removedupes.';
RemoveDupes.Strings.getByName = function (stringName) {
  return this.Bundle.GetStringFromName(this.prefix + stringName);
};
RemoveDupes.Strings.format = function (stringName, argsToFormat) {
  return this.Bundle.formatStringFromName(this.prefix + stringName, argsToFormat);
};

XPCOMUtils.defineLazyGetter(RemoveDupes.Strings, "Bundle",
  function () { return Services.strings.createBundle("chrome://removedupes/locale/removedupes.properties"); }
);

//---------------------------------------------------------

RemoveDupes.App = {};
RemoveDupes.App.getBuildID = function () {
  var re = /rv:([0-9.]+).*Gecko\/([0-9]+)/;
  var arr = re.exec(navigator.userAgent);
  //var revision = arr[1];
  return arr[2];
};

// returns true if the app version is equal-or-higher to minVersion, false otherwise;
RemoveDupes.App.ensureVersion = function (versionThreshold, checkMinimum) {
  var versionCheckResult = Services.vc.compare(Services.appinfo.version, versionThreshold);
  return (   (checkMinimum  && (versionCheckResult >= 0))
          || (!checkMinimum && (versionCheckResult <= 0)));
};

RemoveDupes.App.versionIsAtLeast = function (minVersion) {
  return this.ensureVersion(minVersion, true);
};

RemoveDupes.App.versionIsAtMost = function (maxVersion) {
  return this.ensureVersion(maxVersion, false);
};

//---------------------------------------------------------

// Preferences
// -----------

XPCOMUtils.defineLazyGetter(RemoveDupes, 'Prefs', function () {
    let Preferences = ChromeUtils.import("resource://gre/modules/Preferences.jsm").Preferences;
    return new Preferences('extensions.removedupes.');
});

//---------------------------------------------------------

RemoveDupes.Removal = {};

RemoveDupes.Removal.getLocalFoldersTrashFolder = function () {
  let result = null;
  try {
    let accountManager = Cc["@mozilla.org/messenger/account-manager;1"].getService(Ci.nsIMsgAccountManager);
    var rootFolder = accountManager.localFoldersServer.rootFolder;
    result = rootFolder.getFolderWithFlags(RemoveDupes.FolderFlags.Trash);
  } catch (ex) {
    // We did our best... let's just return _something_
  }
  if (!result || result == "") {
    return 'mailbox://nobody@Local%20Folders/Trash';
  }
  return result;
};

// This function is called from removeDuplicateMessageas,
// either after the dupes are collected,
// without displaying the dialog, in which case each element in the hash is
// an array of Uri's and haveMessageRecords is false, or after displaying the
// dialog, in which case the elements have been replaced with messageRecord
// objects (which also include indications of which messages to keep)
//
// Function returns a hash-map from folder URIs to folder object reference +
// list of headers

RemoveDupes.Removal.arrangeMessagesByFolder = function (messageSetsHashMap,haveMessageRecords) {

  const UsePlainArrayForremovalHeaders = RemoveDupes.App.versionIsAtLeast("79.0");
  const ArrayAppendFunctionName = UsePlainArrayForremovalHeaders ? 'push' : 'appendElement';

  let messagesByFolder = new Object; // TODO: Consider using Map
  for (const hashValue in messageSetsHashMap) {
    let messageSet = messageSetsHashMap[hashValue]; // cleaner iteration please!
    let folderUri, messageHeader;
    for (const messageInfo of messageSet) {
      if (haveMessageRecords) {
        const dupeMessageRecord = messageInfo;
        if (dupeMessageRecord.toKeep) { continue; }
        messageHeader = messenger.msgHdrFromURI(dupeMessageRecord.uri);
      }
      else {
        const messageUri = messageInfo;
        messageHeader = messenger.msgHdrFromURI(messageUri);
      }

      let folderEntry = messagesByFolder[folderUri];
      if (!folderEntry) {
        folderEntry = {
          'folder' : messageHeader.folder,
          'messageHeaders' : UsePlainArrayForremovalHeaders ?
            new Array : Components.classes["@mozilla.org/array;1"].createInstance(Components.interfaces.nsIMutableArray)
        };
        messagesByFolder[folderUri] = folderEntry;
      }
      folderEntry.messageHeaders.push(messageHeader);
    }
  }
  return messagesByFolder;
};

// Returns true on success, false on failure
RemoveDupes.Removal.moveMessages = function (appWindow, msgWindow, messageSetsHashMap, targetFolder, haveMessageRecords)
{
  var messagesByFolder = RemoveDupes.Removal.arrangeMessagesByFolder(messageSetsHashMap,haveMessageRecords);

  // TODO: iterate with field binding, e.g. for(const [key, { foo, bar }] of map) {
  for (let folderUri in messagesByFolder) {
    if (folderUri == targetFolder.URI) continue;
    try {
      RemoveDupes.Removal.moveMessagesFromFolder(
        msgWindow,
        messagesByFolder[folderUri].folder,
        messagesByFolder[folderUri].messageHeaders,
        targetFolder);
    } catch (ex) {
      appWindow.alert(RemoveDupes.Strings.format('failed_to_move_to_folder', [targetFolder.URI]));
      console.log('Failed moving messages from folder\n' + folderUri + '\ntoFolder\n' + targetFolder.URI + '  :\n' + ex);
      return false;
    }
  }
  return true;
};

RemoveDupes.Removal.moveMessagesFromFolder = function (msgWindow, sourceFolder, removalMessageHdrs, targetFolder)
{
  // The copy function name dropped the inital capital sometime between TB 78 and TB 91
  let copyFunctionName = ('copyMessages' in MailServices.copy) ? 'copyMessages' : 'CopyMessages';
  const MovingNotCopying = true;
  const NoListener = null;
  const AllowUndo = true;
  return MailServices.copy[copyFunctionName](
      sourceFolder, removalMessageHdrs, targetFolder,
      MovingNotCopying, NoListener, msgWindow, AllowUndo);
};

RemoveDupes.Removal.deleteMessages = function (appWindow, msgWindow, messageSetsHashMap, haveMessageRecords)
{
  // note that messenger and msgWindow have to be defined! if we're running from the
  // overlay of the 3-pane window, then this is ensured; otherwise,
  // the dupes review dialog should have gotten it as a parameter
  // and set a window-global variable of its own

  let messagesByFolder = RemoveDupes.Removal.arrangeMessagesByFolder(messageSetsHashMap,haveMessageRecords);

  let anyDeletionsPerformed = false; // if we abort right away, the dialog can stay open, so the "accept" is cancelled

  let needConfirmation = RemoveDupes.Prefs.get("confirm_permanent_deletion", true);

  // TODO: iterate with field binding, e.g. for(const [key, { foo, bar }] of map) {
  for (let folderUri in messagesByFolder) {
    let folder = messagesByFolder[folderUri].folder;
    let folderMessageHdrs = messagesByFolder[folderUri].messageHeaders;
    var numMessagesToDelete = folderMessageHdrs.length;
    var confirmationRequestMessage = RemoveDupes.Strings.format('confirm_permanent_deletion_from_folder',
      [numMessagesToDelete ,folder.abbreviatedName]);
    if (needConfirmation && !appWindow.confirm(confirmationRequestMessage)) {
      appWindow.alert(RemoveDupes.Strings.getByName('deletion_aborted'));
      break;
    }
    try {
      RemoveDupes.Removal.deleteMessagesFromFolder(msgWindow, folder, folderMessageHdrs);
      anyDeletionsPerformed = true;
    } catch (ex) {
      appWindow.alert(RemoveDupes.Strings.getByName('failed_to_erase')); // todo: make this folder specific?
      console.log('Failed erasing messages from folder\n' + folderUri + ' :\n' + ex);
      break;
    }
  }
  return anyDeletionsPerformed;
};

RemoveDupes.Removal.deleteMessagesFromFolder = function (msgWindow, folder, removalMessageHdrs)
{
  const DeletePermanently = true;
  const DeleteStorage = true;
  const NoListener = null;
  const AllowUndo = true; // does this really work? I doubt it...
  return folder.deleteMessages(removalMessageHdrs, msgWindow,
  DeletePermanently, DeleteStorage, NoListener, AllowUndo);
};

