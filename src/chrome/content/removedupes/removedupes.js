#ifdef DEBUG
// The following 2 lines enable logging messages to the javascript console:
var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

#endif

// can't we use
// mail/locales/en-US/chrome/messenger/messenger.properties ... isn't that some
// isn't it a string bundle somewhere?

// which information will we use for comparing messages?
var useMessagedId;
var useSendTime;
var useSubject;
var useAuthor;
var useLineCount;

// We will be checking for dupes by building an array of records for messages
// in the folders of interest, which we first sort, then decide which 
// contiguous subsequences are sequences of dupes. We don't want to create an
// array of msgHdr's, because they might be too big, plus accessing their fields
// might be costly (or not, I dunno); we use message records whose constructor
// is the following:

function messageRecord(messageHdr,recordIndex)
{
  this.uri         = messageHdr.folder.getUriForMsg(messageHdr);
  this.folderName  = messageHdr.folder.abbreviatedName;

  // the index is used for comparing collection order
  this.recordIndex = recordIndex;
  
  this.messageId   = (useMessagedId  ? messageHdr.messageId     : null);
  this.sendTime    = (useSendTime    ? messageHdr.dateInSeconds : null);
  this.subject     = (useSubject     ? messageHdr.subject       : null);
  this.author      = (useAuthor      ? messageHdr.author        : null);
  this.lineCount   = (useLineCount   ? messageHdr.lineCount     : null);
}

// ... note, however, even this may be too much if we're short on memory,
// and then we could, say, only keep the URI and generate everything from
// that on the fly

// This is what we use to compare two records; one could think of having
// the prefs UI define different sort orders (e.g. earlier first, unread first,
// and even which fields are more important than others when sorting)

function compareMessageRecords(lhs,rhs)
{
  if (lhs.messageId == rhs.messageId) {
    if (lhs.sendTime == rhs.sendTime) {
      if (lhs.author == rhs.author) {
        if (lhs.subject == rhs.subject) {
          if (lhs.lineCount == rhs.lineCount) {
            return lhs.recordIndex - rhs.recordIndex;
          }
          return (lhs.lineCount - rhs.lineCount);
        }  
        return (lhs.subject < rhs.subject ? -1 : 1);
      }  
      return (lhs.author < rhs.author ? -1 : 1);
    }  
     return (lhs.sendTime < rhs.sendTime ? -1 : 1);
  }  
  return (lhs.messageId < rhs.messageId ? -1 : 1);
}

function areDupes(lhs,rhs)
{
  return(
       (lhs.messageId == rhs.messageId)
    && (lhs.sendTime == rhs.sendTime)
    && (lhs.author == rhs.author)
    && (lhs.subject == rhs.subject)
    && (lhs.lineCount == rhs.lineCount));
}

// this is about the function called from outside this file

function searchAndRemoveDuplicateMessages()
{
  dfBundle = document.getElementById("removedupesStrings");

  useMessagedId  = gRemoveDupesPrefs.getBoolPref("comparison_criteria.message_id", true);
  useSendTime    = gRemoveDupesPrefs.getBoolPref("comparison_criteria.send_time", true);
  useSubject     = gRemoveDupesPrefs.getBoolPref("comparison_criteria.subject", true);
  useAuthor      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.from", true);
  useLineCount   = gRemoveDupesPrefs.getBoolPref("comparison_criteria.num_lines", false);

  var selectedFolders = GetSelectedMsgFolders();
  var messageRecords = new Array;
  collectMessages(selectedFolders,messageRecords,gRemoveDupesPrefs.getBoolPref("search_subfolders_first", false));
  // not sure if we need this or not
  SelectFolder(selectedFolders[0].URI);
  delete selectedFolders;
  var dupeMessageRecords = new Array;
  var dupeInSequenceIndicators = new Array;
  sortAndFindDuplicates(messageRecords,dupeMessageRecords,dupeInSequenceIndicators);
  delete messageRecords;
  if (dupeMessageRecords.length == 0) {
    // maybe this would be better as a message in the bottom status bar
    alert(gRemoveDupesStrings.GetStringFromName("removedupes.no_duplicates_found"));
  }
  else reviewAndRemove(dupeMessageRecords,dupeInSequenceIndicators);
  delete dupeMessageRecords;
  delete dupeInSequenceIndicators;
}


function addSearchFolders(folder, searchFolders, postOrderTraversal)
{
#ifdef DEBUG_addSearchFolders
  jsConsoleService.logStringMessage('addSearchFolders for folder ' + folder.abbreviatedName);
#endif
  // TODO: what we really need to be doing is check among the initial
  // selected folder whether one of them is one of the four folders below,
  // _or_a_subfolder_thereof_; we don't need this checked in every run
  // of addSearchFolders
  if (   (folder.abbreviatedName == gRemoveDupesStrings.GetStringFromName("removedupes.trash_folder_name"))
      || (folder.abbreviatedName == gRemoveDupesStrings.GetStringFromName("removedupes.junk_folder_name"))
      || (folder.abbreviatedName == gRemoveDupesStrings.GetStringFromName("removedupes.drafts_folder_name"))
      || (folder.abbreviatedName == gRemoveDupesStrings.GetStringFromName("removedupes.sent_folder_name")) )
    return;

  if (!postOrderTraversal) {
#ifdef DEBUG_addSearchFolders
    jsConsoleService.logStringMessage('not postorder; pushing folder ' + folder.abbreviatedName);
#endif
    searchFolders.push(folder);
  }
    
  // traverse the children

  if (folder.hasSubFolders) {
    var subFoldersIterator = folder.GetSubFolders();
    do {
      addSearchFolders(
        subFoldersIterator.currentItem().QueryInterface(Components.interfaces.nsIMsgFolder),
        searchFolders,
        postOrderTraversal);
      try {
        subFoldersIterator.next();
      } catch (ex) {
        break;
      }
    } while(true);
  }
  
  if (postOrderTraversal) {
#ifdef DEBUG_addSearchFolders
    jsConsoleService.logStringMessage('postorder; pushing folder ' + folder.abbreviatedName);
#endif
    searchFolders.push(folder);
  }
}

function collectMessages(topFolders,collectedRecords,subfoldersFirst)
{
  // TODO: check we haven't selected some folders along with
  // their subfolders - this would mean false dupes!
  var searchFolders = new Array;
  for(var i = 0; i < topFolders.length; i++) {
    addSearchFolders(topFolders[i],searchFolders,subfoldersFirst);
  }

  for(var i = 0; i < searchFolders.length; i++) {
    // add records for the messages in the i'th search folder
    var folderMessageHdrsIterator =
      searchFolders[i].getMessages(msgWindow);
    while (folderMessageHdrsIterator.hasMoreElements()) {
      var messageHdr = 
        folderMessageHdrsIterator.getNext()
                                 .QueryInterface(Components.interfaces.nsIMsgDBHdr);
      collectedRecords.push(
        new messageRecord(messageHdr,collectedRecords.length));
    }
  }

  delete searchFolders;
}

function sortAndFindDuplicates(messageRecords,dupeMessageRecords,dupeInSequenceIndicators)
{
  messageRecords.sort(compareMessageRecords);
  
  dupeIndicators = new Array(messageRecords.length);

  for (var i=0; i < messageRecords.length-1; i++) {
    if (!(areDupes(messageRecords[i],messageRecords[i+1])))
      continue;
    dupeMessageRecords.push(messageRecords[i]);
    dupeInSequenceIndicators[i] = false;
      // the first dupe is not 'in sequence' to other dupes
    do {
      i++;
      dupeMessageRecords.push(messageRecords[i]);
      dupeInSequenceIndicators[i] = true;
    } while (   (i < messageRecords.length-1) 
             && (areDupes(messageRecords[i],messageRecords[i+1])) );
  }
}

function reviewAndRemove(dupeMessageRecords,dupeInSequenceIndicators)
{
  // this function is only called if there do exist some dupes
#ifdef DEBUG_reviewAndRemove
  jsConsoleService.logStringMessage('in reviewAndRemove\ndupeMessageRecords.length = '+ dupeMessageRecords.length);
  jsConsoleService.logStringMessage('dupeMessageRecords[0].uri = ' + dupeMessageRecords[0].uri);
#endif

  if (!gRemoveDupesPrefs.getBoolPref("confirm_search_and_deletion", true))
  {
    // remove (move to trash or erase completely)
    // without user confirmation or review; we're keeping the first dupe
    // in every sequence of dupes and deleting the rest
    removeDuplicates(
      dupeMessageRecords,
      dupeInSequenceIndicators,
      gRemoveDupesPrefs.getBoolPref("move_to_trash_by_default", true));
  }
  else {
    // open up a dialog in which the user sees all dupes we've found,
    // and can decide which to delete
    window.openDialog(
      "chrome://removedupes/content/removedupes-dialog.xul",
      "removedupes",
      "chrome,resizable=yes",
      messenger,
      msgWindow,
      dupeMessageRecords,
      dupeInSequenceIndicators);
  }
}


