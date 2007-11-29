#ifdef DEBUG
// the following 2 lines enable logging messages to the javascript console:
var jsConsoleService = 
  Components.classes['@mozilla.org/consoleservice;1']
            .getService(Components.interfaces.nsIConsoleService);

// used for rough profiling
var gStartTime;
var gEndTime;
#endif

// see searchAndRemoveDuplicateMessagesUnthreaded()
var gEventTarget = null;
var gImapService =
  Components.classes['@mozilla.org/messenger/imapservice;1']
            .getService(Components.interfaces.nsIImapService);

var gStatusTextField;

//---------------------------------------------------

// a class definition of the listener which we'll
// need for traversing IMAP folders after they've
// been updated with their on-server contents
//---------------------------------------------------
function UpdateFolderDoneListener(folder,searchData) {
  this.folder = folder;
  this.searchData = searchData;
}

UpdateFolderDoneListener.prototype.QueryInterface =
  function(iid) {
    if (iid.equals(Components.interfaces.nsIUrlListener) ||
        iid.equals(Components.interfaces.nsISupports))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  };
  
UpdateFolderDoneListener.prototype.OnStartRunningUrl = 
  function(url) {
#ifdef DEBUG_UpdateFolderDoneListener
   jsConsoleService.logStringMessage('OnStartRunningUrl for folder ' + this.folder.abbreviatedName);
#endif

  };
UpdateFolderDoneListener.prototype.OnStopRunningUrl = 
  function(url, exitCode) {
#ifdef DEBUG_UpdateFolderDoneListener
   jsConsoleService.logStringMessage('OnStopRunningUrl for folder ' + this.folder.abbreviatedName);
#endif
    // TODO: Perhaps we should actually check the exist code...
    // for now we'll just assume the folder update wen't ok,
    // or we'll fail when trying to traverse the children
    finishAddSearchFolders(this.folder,this.searchData);
  };
//---------------------------------------------------


// a class for holding the search parameters (instead of
// using a bunch of globals)
//---------------------------------------------------
function DupeSearchData()
{
  // which information will we use for comparing messages?
  this.useMessageId   = gRemoveDupesPrefs.getBoolPref("comparison_criteria.message_id", true);
  this.useSendTime    = gRemoveDupesPrefs.getBoolPref("comparison_criteria.send_time", true);
  this.useFolder      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.folder", true);
  this.useSubject     = gRemoveDupesPrefs.getBoolPref("comparison_criteria.subject", true);
  this.useAuthor      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.author", true);
  this.useLineCount   = gRemoveDupesPrefs.getBoolPref("comparison_criteria.num_lines", false);
  this.useRecipients  = gRemoveDupesPrefs.getBoolPref("comparison_criteria.recipients", false);
  this.useCCList      = gRemoveDupesPrefs.getBoolPref("comparison_criteria.cc_list", false);
  this.useBody        = gRemoveDupesPrefs.getBoolPref("comparison_criteria.body", false);

#ifdef DEBUG_DupeSearchParameters
  jsConsoleService.logStringMessage('USE criteria: '
    + (this.useMessageId ? 'message ID ' : '') 
    + (this.useSendTime ? 'send time ' : '') 
    + (this.useFolder ? 'folder ' : '') 
    + (this.useSubject ? 'subject ' : '') 
    + (this.useAuthor ? 'author ' : '') 
    + (this.useLineCount ? 'line count ' : '') 
    + (this.useRecipients ? 'recipients ' : '') 
    + (this.useCCList ? 'CC list ' : '') 
    + (this.useBody? 'body ' : '') 
    );
  jsConsoleService.logStringMessage('DON\'T USE criteria: '
    + (!this.useMessageId ? 'message ID ' : '') 
    + (!this.useSendTime ? 'send time ' : '') 
    + (!this.useFolder ? 'folder ' : '') 
    + (!this.useSubject ? 'subject ' : '') 
    + (!this.useAuthor ? 'author ' : '') 
    + (!this.useLineCount ? 'line count ' : '') 
    + (!this.useRecipients ? 'recipients ' : '') 
    + (!this.useCCList ? 'CC list ' : '') 
    + (!this.useBody? 'body ' : '') 
    );
#endif

  // which of the special folders (inbox, sent, etc.) will we be willing
  // to search in for duplicates?
  
  this.allowedSpecialFolders = 
    new RegExp(gRemoveDupesPrefs.getLocalizedStringPref('allowed_special_folders', ''), 'i');
#ifdef DEBUG_DupeSearchParameters
  jsConsoleService.logStringMessage('allowedSpecialFolders = ' + this.allowedSpecialFolders);
#endif

  this.useReviewDialog = 
    gRemoveDupesPrefs.getBoolPref("confirm_search_and_deletion", true);
  // we might have to trigger non-blocking IMAP folder updates;
  // each trigger will increase this, each folder update completing
  // will decrease this
  this.remainingFolders = 0;

  this.dupeSetsHashMap = new Object;
  this.folders = new Array;
}
//---------------------------------------------------


function searchAndRemoveDuplicateMessages()
{
#ifdef DEBUG_searchAndRemoveDuplicateMessages
  jsConsoleService.logStringMessage('searchAndRemoveDuplicateMessages()');
#endif
  //document.getElementById('progress-panel').removeAttribute('collapsed'); 
  gStatusTextField = document.getElementById('statusText');
  gStatusTextField.label = gRemoveDupesStrings.GetStringFromName('removedupes.searching_for_dupes');

  // we'll need this for some calls involving UrlListeners
  
  if (gEventTarget == null) {
    if ("nsIThreadManager" in Components.interfaces) {
       gEventTarget = 
         Components.classes['@mozilla.org/thread-manager;1']
                   .getService().currentThread;
    } else {
       var eventQueueService =
         Components.classes['@mozilla.org/event-queue-service;1']
                   .getService(Components.interfaces.nsIEventQueueService);
       gEventTarget = 
         eventQueueService.getSpecialEventQueue(
           eventQueueService.CURRENT_THREAD_EVENT_QUEUE);
    }
  }
  
  var searchData = new DupeSearchData();
  beginSearchForDuplicateMessages(searchData);
}

function beginSearchForDuplicateMessages(searchData)
{
  searchData.topFolders = GetSelectedMsgFolders();
#ifdef DEBUG_beginSearchForDuplicateMessages
  jsConsoleService.logStringMessage('calling collectMessages for selectedFolders = ' + searchData.topFolders);
#endif
 
  // TODO: check we haven't selected some folders along with
  // their subfolders - this would mean false dupes!
  
  for(var i = 0; i < searchData.topFolders.length; i++) {
    addSearchFolders(searchData.topFolders[i],searchData);
  }

  // At this point, one would expected searchData.folders to contain
  // all of the folders and subfolders we're collecting messages from -
  // but, alas this cannot be! We have to wait for all the UrlListeners
  // to finish their work, and for their subfolders to be processed,
  // etc. etc. etc.

  delete searchData.topFolders;
#ifdef DEBUG_collectMessages
   jsConsoleService.logStringMessage('done with addSearchFolders() calls\nsearchData.remainingFolders = ' + searchData.remainingFolders);
#endif
  
  waitForFolderCollection(searchData);
}

function addSearchFolders(folder, searchData)
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

 searchData.remainingFolders++;

#ifdef DEBUG_addSearchFolders
  jsConsoleService.logStringMessage('pushing folder ' + folder.abbreviatedName);
#endif
  searchData.folders.push(folder);
  
  // is this an IMAP folder?
  
  var imapFolder = null;
  try {
    imapFolder = folder.QueryInterface(Components.interfaces.nsIMsgImapMailFolder);

    var listener = new UpdateFolderDoneListener(folder,searchData);

    var dummyUrl = new Object;
    gImapService.selectFolder(gEventTarget, folder, listener, msgWindow, dummyUrl);
    
    // no traversal of children - the listener will take care of that in due time
    return;

  } catch (ex) {}
  
 
  // If we've gotten here then the folder is locally-stored rather than
  // an IMAP folder so we don't have to 'update' it before continuing the traversal
  
  finishAddSearchFolders(folder,searchData);
  
#ifdef DEBUG_addSearchFolders
  jsConsoleService.logStringMessage('returning from addSearchFolders for folder ' + folder.abbreviatedName);
#endif
}

function finishAddSearchFolders(folder,searchData)
{
#ifdef DEBUG_finishAddSearchFolders
  jsConsoleService.logStringMessage('in finishAddSearchFolders for folder ' + folder.abbreviatedName);
#endif

  gStatusTextField.label = gRemoveDupesStrings.GetStringFromName('removedupes.searching_for_dupes');

  // traverse the children

  if (folder.hasSubFolders) {
    var subFoldersIterator = folder.GetSubFolders();
    do {
      addSearchFolders(
        subFoldersIterator.currentItem().QueryInterface(
          Components.interfaces.nsIMsgFolder),
        searchData);
      try {
        subFoldersIterator.next();
      } catch (ex) {
        break;
      }
    } while(true);
  }

  searchData.remainingFolders--;

#ifdef DEBUG_finishAddSearchFolders
  jsConsoleService.logStringMessage('returning from finishAddSearchFolders for folder ' + folder.abbreviatedName);
#endif
}

function waitForFolderCollection(searchData)
{
#ifdef DEBUG_waitForFolderCollection
   jsConsoleService.logStringMessage('in waitForFolderCollection\nsearchData.remainingFolders = ' + searchData.remainingFolders);
#endif

  gStatusTextField.label = gRemoveDupesStrings.GetStringFromName('removedupes.searching_for_dupes');

  // ... but it might still be the case that we haven't finished 
  // traversingfolders and collecting their subfolders for the dupe
  // search, so we may have to wait some more

  if (searchData.remainingFolders > 0) {
    setTimeout(waitForFolderCollection,100,searchData);
    return;
  }
  continueSearchForDuplicateMessages(searchData);
}
  
function continueSearchForDuplicateMessages(searchData)
{
  // At this point all UrlListeners have finished their work, and all
  // relevant folders have been added to the searchData.folders array

#ifdef DEBUG_collectMessages
   jsConsoleService.logStringMessage('in continueSearchForDuplicateMessages');
#endif
  
  populateDupeSetsHash(searchData);
  delete searchData.folders;
  
  // some criteria are not used when messages are first collected, so the
  // hash map of dupe sets might be a 'rough' partition into dupe sets, which
  // still needs to be refined by additional comparison criteria
  
  if (searchData.useBody) {
    refineDupeSets(searchData);
  }

  if (isEmpty(searchData.dupeSetsHashMap)) {
    // maybe this would be better as a message in the bottom status bar
    alert(gRemoveDupesStrings.GetStringFromName("removedupes.no_duplicates_found"));
  }
  else reviewAndRemoveDupes(searchData);
  //document.getElementById('progress-panel').setAttribute('collapsed', true); 
  gStatusTextField.label = '';

}

function populateDupeSetsHash(searchData)
{
  // messageUriHashmap  will be filled with URIs for _all_ messages;
  // the dupe set hashmap will only have entries for dupes, and these
  // entries will be sets of dupes (technically, arrays of dupes)
  // rather than URIs
  var messageUriHashmap = new Object;
  var dupeSetsHashMap = searchData.dupeSetsHashMap;

#ifdef DEBUG_profile
  gStartTime = (new Date()).getTime();
  var numMessages = 0;
#endif

#ifdef DEBUG_collectMessages
   jsConsoleService.logStringMessage('number of search folders: ' + searchData.folders.length);
#endif

  for(var i = 0; i < searchData.folders.length; i++) {
    var folder = searchData.folders[i];
    if (folder.isServer == true) continue;
    // add records for the messages in the i'th search folder
    var folderMessageHdrsIterator;
    try {
#ifdef DEBUG_collectMessages
      jsConsoleService.logStringMessage('doing getMessages() for folder ' + folder.abbreviatedName);
#endif
      folderMessageHdrsIterator =
        folder.getMessages(msgWindow);
    } catch(ex) {
#ifdef DEBUG
      jsConsoleService.logStringMessage('getMessages() failed for folder ' + folder.abbreviatedName + ':' + ex);
#else
      dump(gRemoveDupesStrings.formatStringFromName('removedupes.failed_getting_messages', [folder.abbreviatedName], 1) + '\n');
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
      if (searchData.useMessageId)
        sillyHash += messageHdr.messageId + '|';
      if (searchData.useSendTime)
        sillyHash += messageHdr.dateInSeconds + '|';
      if (searchData.useFolder)
        sillyHash += folder.uri + '|';
      if (searchData.useSubject)
        sillyHash += messageHdr.subject + '|6xX$\WG-C?|';
          // the extra 'junk string' is intended to reduce the chance of getting the subject
          // field being mixed up with other fields in the hash, i.e. in case the subject
          // ends with something like "|55"
      if (searchData.useAuthor)
        sillyHash += messageHdr.author + '|^#=)A?mUi5|';
      if (searchData.useRecipients)
        sillyHash += messageHdr.recipients + '|Ei4iXn=Iv*|';
      if (searchData.useCCList)
        sillyHash += messageHdr.ccList + '|w7Exh\' s%k|';
      if (searchData.useLineCount)
        sillyHash += messageHdr.lineCount;
      var uri = folder.getUriForMsg(messageHdr);
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
          // TODO: use [blah, blah] as the array constructor
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
  gEndTime = (new Date()).getTime();
  jsConsoleService.logStringMessage('hashed ' + numMessages + ' messages in ' + searchData.folders.length + ' folders');
  jsConsoleService.logStringMessage('hashing time = ' + (gEndTime-gStartTime) + ' ms');
  gStartTime = (new Date()).getTime();
#endif
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

function refineDupeSets(searchData)
{
  dupeSetsHashMap = searchData.dupeSetsHashMap;
  // we'll split every dupe set into separate sets based on additional
  // comparison criteria (the more 'expensive' ones); size-1 dupe sets
  // are removed from the hash map entirely.
  
  // TODO: for now, our only 'expensive' criterion is the message body,
  // so I'm leaving the actualy comparison code in this function and
  // not even checking for searchData.useBody; if and when we get additional
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

function reviewAndRemoveDupes(searchData)
{
#ifdef DEBUG_reviewAndRemove
  jsConsoleService.logStringMessage('in reviewAndRemoveDupes');
#endif

  if (!searchData.useReviewDialog)
  {
    // remove (move to trash or erase completely)
    // without user confirmation or review; we're keeping the first dupe
    // in every sequence of dupes and deleting the rest
    removeDuplicates(
      searchData.dupeSetsHashMap,
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
      searchData.dupeSetsHashMap);
  }
  delete searchData;
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
