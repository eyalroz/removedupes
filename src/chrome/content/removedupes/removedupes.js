#ifdef DEBUG
// The following 2 lines enable logging messages to the javascript console:
var jsConsoleService = Components.classes['@mozilla.org/consoleservice;1'].getService();
jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

// used for rough profiling
var gStartTime;
var gEndTime;

#endif

// can't we use
// mail/locales/en-US/chrome/messenger/messenger.properties ... isn't that some
// isn't it a string bundle somewhere?

// which information will we use for comparing messages?
var useMessageId;
var useSendTime;
var useSubject;
var useAuthor;
var useLineCount;

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

  useMessageId  = gRemoveDupesPrefs.getBoolPref("comparison_criteria.message_id", true);
  useSendTime    = gRemoveDupesPrefs.getBoolPref("comparison_criteria.send_time", true);
  useSubject     = gRemoveDupesPrefs.getBoolPref("comparison_criteria.subject", true);
  useAuthor      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.from", true);
  useLineCount   = gRemoveDupesPrefs.getBoolPref("comparison_criteria.num_lines", false);

  var selectedFolders = GetSelectedMsgFolders();
  var dupeSetsHashMap = new Object;
#ifdef DEBUG_searchAndRemoveDuplicateMessages
  jsConsoleService.logStringMessage('calling collectMessages for selectedFolders = ' + selectedFolders);
#endif
#ifdef DEBUG_profile
  gStartTime = (new Date()).getTime();
#endif
  collectMessages(
    selectedFolders,
    dupeSetsHashMap,
    gRemoveDupesPrefs.getBoolPref("search_subfolders_first", false));
#ifdef DEBUG_profile
  gEndTime = (new Date()).getTime();
  jsConsoleService.logStringMessage('collectMessages time = ' + (gEndTime-gStartTime));
  gStartTime = (new Date()).getTime();
#endif
  // not sure if we need this or not
  //SelectFolder(selectedFolders[0].URI);
  delete selectedFolders;
  
  // TODO: isn't there a more decent way to check for emptyness of an Object?
  var noDupeSets = true;
  for (var hashValue in dupeSetsHashMap) {
    noDupeSets = false;
    break;
  }
  
  if (noDupeSets) {
    // maybe this would be better as a message in the bottom status bar
    alert(gRemoveDupesStrings.GetStringFromName("removedupes.no_duplicates_found"));
  }
  else reviewAndRemove(dupeSetsHashMap);
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
#ifdef DEBUG_addSearchFolders
  jsConsoleService.logStringMessage('returning from addSearchFolders for folder ' + folder.abbreviatedName);
#endif
}

function collectMessages(topFolders,dupeSetsHashMap,subfoldersFirst)
{
  // TODO: check we haven't selected some folders along with
  // their subfolders - this would mean false dupes!
  var searchFolders = new Array;
  for(var i = 0; i < topFolders.length; i++) {
    addSearchFolders(topFolders[i],searchFolders,subfoldersFirst);
  }

  var messageUriHashmap = new Object;

#ifdef DEBUG_profile
  var numMessages = 0;
#endif

  for(var i = 0; i < searchFolders.length; i++) {
   if (searchFolders[i].isServer == true) continue;
    // add records for the messages in the i'th search folder
    var folderMessageHdrsIterator;
    try {
      folderMessageHdrsIterator =
        searchFolders[i].getMessages(msgWindow);
    } catch(ex) {
#ifdef DEBUG
      jsConsoleService.logStringMessage('getMessages() failed for folder ' + searchFolders[i].abbreviatedName + ':' + ex);
#else
      alert('failed to get messages from folder' + searchFolders[i].abbreviatedName);
#endif
    }

    while (folderMessageHdrsIterator.hasMoreElements()) {
      var messageHdr = 
        folderMessageHdrsIterator.getNext()
                                 .QueryInterface(Components.interfaces.nsIMsgDBHdr);
      // note that there could theoretically be two messages which should not
      // have the same hash, but do have it, if the subject includes the string
      // |6xX$\WG-C?| or the author includes the string '|^#=)A?mUi5|' ; this
      // is however highly unlikely... about as unlikely as collisions of
      // a hash function, except that we haven't randomized; still,
      // if a malicious user sent you e-mail with these strings in the author
      // or subject fields, you probably don't care about deleting them anyways
#ifdef DEBUG_profile
      numMessages++;
#endif
      
      var sillyHash = '';
      if (useMessageId)
        sillyHash += messageHdr.messageId + '|';
      if (useSendTime)
        sillyHash += messageHdr.dateInSeconds + '|';
      if (useSubject)
        sillyHash += messageHdr.subject + '|6xX$\WG-C?|';
      if (useAuthor)
        sillyHash += messageHdr.author + '|^#=)A?mUi5|';
      if (useLineCount)
        sillyHash += messageHdr.lineCount;
      var uri = searchFolders[i].getUriForMsg(messageHdr);
      if (sillyHash in messageUriHashmap) {
        if (sillyHash in dupeSetsHashMap) {
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('sillyHash \n' + sillyHash + '\nis a third-or-later dupe');
#endif
          // just add the current message's URI, no need to copy anything
          dupeSetsHashMap[sillyHash].push(uri);
        } else {
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('sillyHash \n' + sillyHash + '\nis a second dupe');
#endif
          // the URI in messageUriHashmap[sillyMap] has not been copied to
          // the dupes hash since until now we did not know it was a dupe;
          // copy it together with our current message's URI
          dupeSetsHashMap[sillyHash] = new Array(messageUriHashmap[sillyHash], uri);
        }
      } else {
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('sillyHash \n' + sillyHash + '\nis not a dupe (or a first dupe)');
#endif
        messageUriHashmap[sillyHash] = uri;
      }
    }
  }

#ifdef DEBUG_profile
    jsConsoleService.logStringMessage('processed ' + numMessages + ' messages in ' + searchFolders.length + ' folders');
#endif
  delete searchFolders;
}

function reviewAndRemove(dupeSetsHashMap/*,dupeInSequenceIndicators*/)
{
  // this function is only called if there do exist some dupes
#ifdef DEBUG_reviewAndRemove
  jsConsoleService.logStringMessage('in reviewAndRemove');
#endif

  if (!gRemoveDupesPrefs.getBoolPref("confirm_search_and_deletion", true))
  {
    // remove (move to trash or erase completely)
    // without user confirmation or review; we're keeping the first dupe
    // in every sequence of dupes and deleting the rest
    removeDuplicates(
      dupeSetsHashMap,
      gRemoveDupesPrefs.getBoolPref("move_to_trash_by_default", true),
      false // the uri's have not been replaced with messageRecords
      );
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
      dupeSetsHashMap);
  }
}


#ifdef DEBUG_secondMenuItem
function secondMenuItem()
{
  stime = (new Date()).getTime();
  alert("hello, world!");
  etime = (new Date()).getTime();
  alert("it was " + (etime - stime) + " miliseconds");
}
#endif

#ifdef DEBUG_profile

function str2arr(str)
{
  var bin = Array(str.length);
  for(var i = 0; i < str.length; i++)
    bin[i] = str.charCodeAt(i);
  return bin;
}

function hashTest2(messageRecords)
{
  gStartTime = (new Date()).getTime();
  var messageUriHashmap = new Object;
  var dupeUriHashmap = new Object;
  //var hasher = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  //var algorithm = Ci.nsICryptoHash.MD5;
  for (var i = 0; i < messageRecords.length; i++) {
    //hasher.init(algorithm);
    
    //hashes[i] = hasher.finish(false /* not b64 encoded */);
    var sillyHash = messageRecords[i].messageId 
      + messageRecords[i].sendTime 
      + messageRecords[i].author 
      + messageRecords[i].subject 
      + messageRecords[i].lineCount;
    if (sillyHash in messageUriHashmap) {
      if (sillyHash in dupeUriHashmap) {
        // just add the current message's URI, no need to copy anything
        dupeUriHashmap[sillyHash].push(messageRecords[i].uri);
      } else {
        // the URI in messageUriHashmap[sillyMap] has not been copied to
        // the dupes hash since until now we did not know it was a dupe;
        // copy it together with our current message's URI
        sillyHashMessages = new Array(messageUriHashmap[sillyHash], messageRecords[i].uri);
      }
    } else {
      messageUriHashmap[sillyHash] = messageRecords[i].uri;
    }
  }
  gEndTime = (new Date()).getTime();
  jsConsoleService.logStringMessage('time to populate dupe lists for ' + messageRecords.length + ' messages = ' + (gEndTime-gStartTime));
  gStartTime = (new Date()).getTime();
}


#endif