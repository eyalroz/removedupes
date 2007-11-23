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
#ifdef DEBUG_searchAndRemoveDuplicateMessages
    jsConsoleService.logStringMessage('can\'t use the new thread manager, doing it the older way');
#endif
    // we've probably gotten here because we're in an older build,
    // with the old-skool threading API; let's try it as well
    var Thread = new Components.Constructor("@mozilla.org/thread;1", "nsIThread", "init");
    searchThread = new Thread(
      searchForDupesRunnable,
      0,
      Components.interfaces.nsIThread.PRIORITY_NORMAL,
      Components.interfaces.nsIThread.SCOPE_GLOBAL,
      Components.interfaces.nsIThread.STATE_JOINABLE);
#ifdef DEBUG_searchAndRemoveDuplicateMessages
    jsConsoleService.logStringMessage('thread created');
#endif
    needJoining = true;
  }
  setTimeout(searchAndRemoveDuplicatesJoiner, 200, searchForDupesRunnable, searchThread, needJoining);
#ifdef DEBUG_searchAndRemoveDuplicateMessages
    jsConsoleService.logStringMessage('timeout set');
#endif
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
#ifdef DEBUG_searchAndRemoveDuplicateMessages
  jsConsoleService.logStringMessage('searchAndRemoveDuplicateMessagesUnthreaded()');
#endif
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
  gUseBody        = gRemoveDupesPrefs.getBoolPref("comparison_criteria.body", false);
  
  // some criteria are not used when messages are first collected, so the
  // hash map of dupe sets might be a 'rough' partition into dupe sets, which
  // still needs to be refined by additional comparison criteria
  
  var additionalRefinementOfDupeSets = gUseBody;
  
  gAllowedSpecialFolders = 
    new RegExp(gRemoveDupesPrefs.getLocalizedStringPref('allowed_special_folders', ''), 'i');
#ifdef DEBUG_searchForDuplicateMessages
  jsConsoleService.logStringMessage('gAllowedSpecialFolders = ' + gAllowedSpecialFolders);
#endif

  var selectedFolders = GetSelectedMsgFolders();
#ifdef DEBUG_searchForDuplicateMessages
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
  if (additionalRefinementOfDupeSets) {
    refineDupeSets(dupeSetsHashMap);
  }
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
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('doing getMessages() for folder ' + searchFolders[i].abbreviatedName);
#endif
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
      // Notes:
      // 1. There could theoretically be two messages which should not
      //    have the same hash, but do have it, if the subject includes the
      //    string |6xX$\WG-C?| or the author includes the string 
      //    '|^#=)A?mUi5|' ; this is however highly unlikely... about as 
      //    unlikely as collisions of a hash function, except that we haven't
      //    randomized; still, if a malicious user sent you e-mail with these
      //    strings in the author or subject fields, you probably don't care
      //    about deleting them anyways
      // 2. We're not making full body comparisons/hashing here - only after
      //    creating dupe sets based on the 'cheap' criteria will we look at
      //    the message body
      
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

function messageBodyFromURI(msgURI)
{
  var msgContent = "";
#ifdef DEBUG_messageBodyFromURI
   jsConsoleService.logStringMessage('in messageBodyFromURI(' + msgURI + ')');
#endif
  var MsgService = messenger.messageServiceFromURI(msgURI);
  var MsgStream =  Components.classes["@mozilla.org/network/sync-stream-listener;1"].createInstance();
  var consumer = MsgStream.QueryInterface(Components.interfaces.nsIInputStream);
  var ScriptInput = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance();
  var ScriptInputStream = ScriptInput.QueryInterface(Components.interfaces.nsIScriptableInputStream);
  ScriptInputStream.init(consumer);
  try {
    MsgService .streamMessage(msgURI, MsgStream, msgWindow, null, false, null);
  } catch (ex) {
    alert("error: " + ex)
  }
  ScriptInputStream.available();
  while (ScriptInputStream.available()) {
    msgContent = msgContent + ScriptInputStream.read(512);
  }
  // the message headers end on the first empty line, and lines are delimited
  // by \r\n's ; of course, this is a very lame hack, since if the message has
  // multiple MIME parts we're still getting the headers of all the sub-parts,
  // and not taking into any account the multipart delimiters
  return msgContent.split('\r\n\r\n')[1];
}

function refineDupeSets(dupeSetsHashMap)
{
  // we'll split every dupe set into separate sets based on additional
  // comparison criteria (the more 'expensive' ones); size-1 dupe sets
  // are removed from the hash map entirely.
  
  // TODO: for now, our only 'expensive' criterion is the message body,
  // so I'm leaving the actualy comparison code in this function and
  // not even checking for gUseBody; if and when we get additional
  // criteria this should be rewritten so that dupeSet[i] gets
  // a comparison record created for it, then for every j we call
  // ourcomparefunc(comparisonrecord, dupeSet[j])
  
  // Note: I don't bother with an actual sort as I expect dupe sets
  // to be small, or at least to have very few sub-dupe-sets
 
  //var MessageURI = GetFirstSelectedMessage();

 
  for (hashValue in dupeSetsHashMap) {
#ifdef DEBUG_refineDupeSets
    jsConsoleService.logStringMessage('refining for dupeSetsHashMap value ' + hashValue);
#endif
    var dupeSet = dupeSetsHashMap[hashValue];
    for (var i=0; i < dupeSet.length; i++) {
      // if dupeSet[i] is null, we've already placed it in a new refined dupeset
      if (dupeSet[i] == null) continue;
      // creatingSubDupeSet becomes true only when we find there's
      // at least one additional message which is really the same as
      // dupeSet[i]
      var creatingSubDupeSet = false;
      var messageBody = messageBodyFromURI(dupeSet[i]);
#ifdef DEBUG_refineDupeSets
      jsConsoleService.logStringMessage('i = ' + i + '  body = \n' + messageBody);
#endif
      var subsetHashValue;
      for (var j=i+1; j < dupeSet.length; j++) {
        // skip dupes in the set which were already
        // found to be equal to previous ones
        if (dupeSet[i] == null) continue;
#ifdef DEBUG_refineDupeSets
        jsConsoleService.logStringMessage('j = ' + j + '  body = \n' + messageBodyFromURI(dupeSet[j]));
#endif
        if (messageBody == messageBodyFromURI(dupeSet[j])) {
          if (!creatingSubDupeSet) {
            subsetHashValue = hashValue + '|' + i;
            dupeSetsHashMap[subsetHashValue] = new Array(dupeSet[i], dupeSet[j]);
            creatingSubDupeSet = true;
#ifdef DEBUG_refineDupeSets
            jsConsoleService.logStringMessage('created new set with i = ' + i + ' j = ' + j + ' ; value = ' + subsetHashValue);
#endif
          }
          else {
            dupeSetsHashMap[subsetHashValue].push(dupeSet[j]);
#ifdef DEBUG_refineDupeSets
            jsConsoleService.logStringMessage('added j = ' + j + ' to set with value ' + subsetHashValue);
#endif
          }
          dupeSet[j] = null;
        }
      }
    }
    delete dupeSetsHashMap[hashValue];
  }
}


function reviewAndRemove(dupeSetsHashMap)
{
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

function secondMenuItem()
{
/*  stime = (new Date()).getTime();
  alert("hello, world!");
  etime = (new Date()).getTime();
  alert("it was " + (etime - stime) + " miliseconds");*/

 // example taken from http://forums.mozillazine.org/viewtopic.php?t=214824
  var content = "";
  var MessageURI = GetFirstSelectedMessage();
  var MsgService = messenger.messageServiceFromURI(MessageURI);
  var MsgStream =  Components.classes["@mozilla.org/network/sync-stream-listener;1"].createInstance();
  var consumer = MsgStream.QueryInterface(Components.interfaces.nsIInputStream);
  var ScriptInput = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance();
  var ScriptInputStream = ScriptInput.QueryInterface(Components.interfaces.nsIScriptableInputStream);
  ScriptInputStream.init(consumer);
  try {
    MsgService.streamMessage(MessageURI, MsgStream, msgWindow, null, false, null);
  } catch (ex) {
    alert("error: "+ex)
  }
  ScriptInputStream .available();
  while (ScriptInputStream .available()) {
    content = content + ScriptInputStream .read(512);
  }
  //alert(content);
  //jsConsoleService.logStringMessage('content of current selected message:\n\n' + content);
/*  var lines = content.split('\n');
  var i = 1;
  for (i = 0; i < lines.length; i++) {
    jsConsoleService.logStringMessage('line ' + i + ' | length ' + lines[i].length + ' | ' + string2hex(lines[i]));
  } */
  jsConsoleService.logStringMessage('content of current selected message after headers:\n\n' + content.split('\r\n\r\n')[1]);

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
