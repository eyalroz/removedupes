#ifdef DEBUG
// the following 2 lines enable logging messages to the javascript console:
var jsConsoleService = 
  Components.classes['@mozilla.org/consoleservice;1'].getService();
jsConsoleService.QueryInterface(Components.interfaces.nsIConsoleService);

// used for rough profiling
var gStartTime;
var gEndTime;
#endif

// which of the special folders (inbox, sent, etc.) will we be willing
// to search in for duplicates?
var gAllowedSpecialFolders;

// which information will we use for comparing messages?
var gUseMessageId;
var gUseSendTime;
var gUseSubject;
var gUseAuthor;
var gUseLineCount;
var gUseFolder;
var gUseRecipients;
var gUseCCList;

// a class definition of the runnable which will do
// our duplicate search, on a different thread
//---------------------------------------------------

function SearchForDupesRunnable() {
  this.dupeSetsHashMap = new Object;
  this.done = false;
}

SearchForDupesRunnable.prototype.QueryInterface =
  function(iid) {
    if (iid.equals(Components.interfaces.nsIRunnable) ||
        iid.equals(Components.interfaces.nsISupports))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
SearchForDupesRunnable.prototype.run = 
  function() {
    searchForDuplicateMessages(this.dupeSetsHashMap);
    this.done = true;
  }
//---------------------------------------------------

function searchAndRemoveDuplicateMessages()
{
  //document.getElementById('progress-panel').removeAttribute('collapsed'); 
  var statusTextField = document.getElementById('statusText');
  statusTextField.label = gRemoveDupesStrings.GetStringFromName('removedupes.searching_for_dupes');
  var searchForDupesRunnable = new SearchForDupesRunnable();
  var searchThread;
  var needJoining = false;
  
  try {
    searchThread =
      Components.classes["@mozilla.org/thread-manager;1"]
                .getService().newThread(0);
    searchThread.dispatch(searchForDupesRunnable, searchThread.DISPATCH_NORMAL);
  }
  catch(ex) {
    // we've probably gotten here because we're in an older build,
    // with the old-skool threading API; let's try it as well
    var Thread = new Components.Constructor("@mozilla.org/thread;1", "nsIThread", "init");
    searchThread = new Thread(
      searchForDupesRunnable,
      0,
      Components.interfaces.nsIThread.PRIORITY_NORMAL,
      Components.interfaces.nsIThread.SCOPE_GLOBAL,
      Components.interfaces.nsIThread.STATE_JOINABLE);
    needJoining = true;
  }
  setTimeout(searchAndRemoveDuplicatesJoiner, 200, searchForDupesRunnable, searchThread, needJoining);
}

function searchAndRemoveDuplicatesJoiner(searchForDupesRunnable, searchThread, needJoining)
{
#ifdef DEBUG_searchAndRemoveDuplicateMessages
  jsConsoleService.logStringMessage('searchAndRemoveDuplicatesJoiner\ndone = ' + searchForDupesRunnable.done); // + '\nthread = ' + thread);
#endif
  if (searchForDupesRunnable.done) {
    var statusTextField = document.getElementById('statusText');
  
    if (isEmpty(searchForDupesRunnable.dupeSetsHashMap)) {
      // maybe this would be better as a message in the bottom status bar
      alert(gRemoveDupesStrings.GetStringFromName("removedupes.no_duplicates_found"));
    }
    else reviewAndRemove(searchForDupesRunnable.dupeSetsHashMap);
    //document.getElementById('progress-panel').setAttribute('collapsed', true); 
    statusTextField.label = '';

    if (needJoining) {
      searchThread.join();
    }
  }
  else {
    setTimeout(searchAndRemoveDuplicatesJoiner, 200, searchForDupesRunnable, searchThread, needJoining);
  }
}


// This next function is the non-threaded version of the previous one
function searchAndRemoveDuplicateMessagesUnthreaded()
{
  //document.getElementById('progress-panel').removeAttribute('collapsed'); 
  var statusTextField = document.getElementById('statusText');
  statusTextField.label = gRemoveDupesStrings.GetStringFromName('removedupes.searching_for_dupes');
  var dupeSetsHashMap = new Object;
  searchForDuplicateMessages(dupeSetsHashMap);
  
  if (isEmpty(dupeSetsHashMap)) {
    // maybe this would be better as a message in the bottom status bar
    alert(gRemoveDupesStrings.GetStringFromName("removedupes.no_duplicates_found"));
  }
  else reviewAndRemove(dupeSetsHashMap);
  //document.getElementById('progress-panel').setAttribute('collapsed', true); 
  statusTextField.label = '';
}


function searchForDuplicateMessages(dupeSetsHashMap)
{
  gUseMessageId   = gRemoveDupesPrefs.getBoolPref("comparison_criteria.message_id", true);
  gUseSendTime    = gRemoveDupesPrefs.getBoolPref("comparison_criteria.send_time", true);
  gUseFolder      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.folder", true);
  gUseSubject     = gRemoveDupesPrefs.getBoolPref("comparison_criteria.subject", true);
  gUseAuthor      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.from", true);
  gUseLineCount   = gRemoveDupesPrefs.getBoolPref("comparison_criteria.num_lines", false);
  gUseRecipients  = gRemoveDupesPrefs.getBoolPref("comparison_criteria.recipients", false);
  gUseCCList      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.cc_list", false);
  
  gAllowedSpecialFolders = 
    new RegExp(gRemoveDupesPrefs.getLocalizedStringPref('allowed_special_folders', ''), 'i');
#ifdef DEBUG_searchAndRemoveDuplicateMessages
  jsConsoleService.logStringMessage('gAllowedSpecialFolders = ' + gAllowedSpecialFolders);
#endif

  var selectedFolders = GetSelectedMsgFolders();
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
  jsConsoleService.logStringMessage('collectMessages time = ' + (gEndTime-gStartTime) + ' ms');
  gStartTime = (new Date()).getTime();
#endif
  // not sure if we need this or not
  //SelectFolder(selectedFolders[0].URI);
  delete selectedFolders;
}


function addSearchFolders(folder, searchFolders, postOrderTraversal)
{
#ifdef DEBUG_addSearchFolders
  jsConsoleService.logStringMessage('addSearchFolders for folder ' + folder.abbreviatedName);
#endif

 if (!folder.canFileMessages && !folder.rootFolder) {
   // it's a news folder or some such thing which we shouldn't mess with
   return;
 }
   
 if (!folder.canRename && !folder.rootFolder) {
   // it's a special folder
   if (!gAllowedSpecialFolders.test(folder.abbreviatedName))
     return;
 }

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
        subFoldersIterator.currentItem().QueryInterface(
          Components.interfaces.nsIMsgFolder),
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
      dump(gRemoveDupesStrings.formatStringFromName('removedupes.failed_getting_messages', [searchFolders[i].abbreviatedName], 1) + '\n');
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
      if (gUseMessageId)
        sillyHash += messageHdr.messageId + '|';
      if (gUseSendTime)
        sillyHash += messageHdr.dateInSeconds + '|';
      if (gUseFolder)
        sillyHash += searchFolders[i].uri + '|';
      if (gUseSubject)
        sillyHash += messageHdr.subject + '|6xX$\WG-C?|';
          // the extra 'junk string' is intended to reduce the chance of getting the subject
          // field being mixed up with other fields in the hash, i.e. in case the subject
          // ends with something like "|55"
      if (gUseAuthor)
        sillyHash += messageHdr.author + '|^#=)A?mUi5|';
      if (gUseRecipients)
        sillyHash += messageHdr.recipients + '|Ei4iXn=Iv*|';
      if (gUseCCList)
        sillyHash += messageHdr.ccList + '|w7Exh\' s%k|';
      if (gUseLineCount)
        sillyHash += messageHdr.lineCount;
      var uri = searchFolders[i].getUriForMsg(messageHdr);
      if (sillyHash in messageUriHashmap) {
        if (sillyHash in dupeSetsHashMap) {
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('sillyHash\n' + sillyHash + '\nis a third-or-later dupe');
#endif
          // just add the current message's URI, no need to copy anything
          dupeSetsHashMap[sillyHash].push(uri);
        } else {
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('sillyHash\n' + sillyHash + '\nis a second dupe');
#endif
          // the URI in messageUriHashmap[sillyMap] has not been copied to
          // the dupes hash since until now we did not know it was a dupe;
          // copy it together with our current message's URI
          dupeSetsHashMap[sillyHash] = new Array(messageUriHashmap[sillyHash], uri);
        }
      } else {
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('sillyHash\n' + sillyHash + '\nis not a dupe (or a first dupe)');
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

function reviewAndRemove(dupeSetsHashMap)
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
      (gRemoveDupesPrefs.getCharPref('default_action', 'move') == 'delete_permanently'),
      gRemoveDupesPrefs.getCharPref('default_target_folder', null),
      false // the uri's have not been replaced with messageRecords
      );
  }
  else {
    if (!gMessengerBundle)
      gMessengerBundle = document.getElementById("bundle_messenger");

    // open up a dialog in which the user sees all dupes we've found,
    // and can decide which to delete
    window.openDialog(
      "chrome://removedupes/content/removedupes-dialog.xul",
      "removedupes",
      "chrome,resizable=yes",
      messenger,
      msgWindow,
      gMessengerBundle,
      gDBView,
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
  //var hasher = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
  //var algorithm = Components.interfaces.nsICryptoHash.MD5;
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
  jsConsoleService.logStringMessage('time to populate dupe lists for ' + messageRecords.length + ' messages = ' + (gEndTime-gStartTime) + ' ms');
  gStartTime = (new Date()).getTime();
}

#endif
