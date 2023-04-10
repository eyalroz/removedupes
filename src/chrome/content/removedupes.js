var { RemoveDupes } = ChromeUtils.import("chrome://removedupes/content/removedupes-common.js");

if ("undefined" == typeof(messenger)) {
  var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
}

RemoveDupes.__defineGetter__("ImapService", function() {
  delete RemoveDupes.ImapService;
  return RemoveDupes.ImapService =
    Cc['@mozilla.org/messenger/imapservice;1'].getService(Ci.nsIImapService);
});

RemoveDupes.MessengerOverlay = {

  setNamedStatus: function(stringName) {
    RemoveDupes.MessengerOverlay.statusTextField.label =
      (stringName ? RemoveDupes.Strings.getByName(stringName) : null);
  },

  // These default criteria are used in the dupe search if the preferences
  // are not set for some reason
  // const
  SearchCriterionUsageDefaults : {
    message_id: true,
    send_time: true,
    size: true,
    folder: true,
    subject: true,
    author: true,
    num_lines: false,
    recipients: false,
    cc_list: false,
    flags: false,
    body: false
  },

  // see searchAndRemoveDuplicateMessages
  EventTarget : null,
  StatusTextField : null,
  originalsFolders : null,
  originalsFolderUris : null,

  // searchAndRemoveDuplicateMessages -
  // Called from the UI to trigger a new dupe search

  searchAndRemoveDuplicateMessages : function() {
#ifdef DEBUG_searchAndRemoveDuplicateMessages
    console.log('searchAndRemoveDuplicateMessages()');
#endif

    //document.getElementById('progress-panel').removeAttribute('collapsed');
    RemoveDupes.MessengerOverlay.statusTextField =
      document.getElementById('statusText');
    RemoveDupes.MessengerOverlay.setNamedStatus('searching_for_dupes');

    // we'll need this for some calls involving UrlListeners

    if (RemoveDupes.MessengerOverlay.eventTarget == null) {
      if ("nsIThreadManager" in Ci) {
         RemoveDupes.MessengerOverlay.eventTarget =
           Cc['@mozilla.org/thread-manager;1'].getService().currentThread;
      } else {
         var eventQueueService =
           Cc['@mozilla.org/event-queue-service;1'].getService(Ci.nsIEventQueueService);
         RemoveDupes.MessengerOverlay.eventTarget =
           eventQueueService.getSpecialEventQueue(
             eventQueueService.CURRENT_THREAD_EVENT_QUEUE);
      }
    }

    var searchData = new RemoveDupes.DupeSearchData();
    // the marked 'originals folders' are only used as such
    // for this coming search, not for subsequent searches
    RemoveDupes.MessengerOverlay.originalsFolders = null;
    RemoveDupes.MessengerOverlay.originalsFolderUris = null;
    if (typeof gFolderTreeView != 'undefined') {
      if (gFolderTreeView) { gFolderTreeView._tree.invalidate(); }
    }
    searchData.keyPressEventListener =
      function(ev) {RemoveDupes.MessengerOverlay.onKeyPress(ev,searchData);}
    window.addEventListener("keypress", searchData.keyPressEventListener, true);
    RemoveDupes.MessengerOverlay.beginSearchForDuplicateMessages(searchData);
  },

  onKeyPress : function(ev,searchData) {
    if ((ev.keyCode == KeyEvent.DOM_VK_CANCEL ||
         ev.keyCode == 27 ||
         ev.keyCode == KeyEvent.DOM_VK_BACK_SPACE) &&
        !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
#ifdef DEBUG_onKeyPress
      console.log("Esc Esc");
#endif
      searchData.userAborted = true;
    }
#ifdef DEBUG_onKeyPress
    console.log("got other keycode: " + ev.keyCode + " | " + String.fromCharCode(ev.keyCode));
#endif
  },

  beginSearchForDuplicateMessages : function(searchData) {
    searchData.topFolders = GetSelectedMsgFolders();

    if (searchData.topFolders.length == 0) {
      // no folders selected; we shouldn't get here
      RemoveDupes.MessengerOverlay.abortDupeSearch(searchData,'no_folders_selected');
      return;
    }

    // TODO: check we haven't selected some folders along with
    // their subfolders - this would mean false dupes!

    for (let i = 0; i < searchData.topFolders.length; i++) {
      var folder = searchData.topFolders[i];
      if (searchData.skipSpecialFolders) {
        if (!folder.canRename && (folder.rootFolder != folder) ) {
#ifdef DEBUG_beginSearchForDuplicateMessages
          console.log('special folder ' + folder.abbreviatedName);
#endif
          // one of the top folders is a special folders; if it's not
          // the Inbox (which we do search), skip it
          if (!(folder.flags & RemoveDupes.FolderFlags.Inbox)) {
#ifdef DEBUG_beginSearchForDuplicateMessages
            console.log(
              'skipping special folder ' + folder.abbreviatedName +
              'due to ' + folder.flags + ' & ' +
              RemoveDupes.FolderFlags.Inbox + ' = ' +
              (folder.flags & RemoveDupes.FolderFlags.Inbox));
#endif
           continue;
          }
        }
      }
#ifdef DEBUG_beginSearchForDuplicateMessages
      console.log('addSearchFolders for ' + folder.abbreviatedName);
#endif
      RemoveDupes.MessengerOverlay.addSearchFolders(folder,searchData);
    }

    if (searchData.folders.size == 0) {
      // all top folders were special folders and therefore skipped
      RemoveDupes.namedAlert(window, 'not_searching_special_folders');
      RemoveDupes.MessengerOverlay.abortDupeSearch(searchData);
      return;
    }

    delete searchData.topFolders;
#ifdef DEBUG_collectMessages
     console.log(
       'done with RemoveDupes.MessengerOverlay.addSearchFolders() ' +
       'calls\nsearchData.remainingFolders = ' + searchData.remainingFolders);
#endif

    // At this point, one would expected searchData.folders to contain
    // all of the folders and subfolders we're collecting messages from -
    // but, alas this cannot be... We have to wait for all the IMAP
    // folders and subfolders to become ready and then be processed;
    // so let's call a sleep-poll function

    RemoveDupes.MessengerOverlay.waitForFolderCollection(searchData);
  },

  abortDupeSearch : function(searchData,labelStringName) {
    window.removeEventListener("keypress", searchData.keyPressEventListener, true);
    delete searchData;
    RemoveDupes.MessengerOverlay.setNamedStatus(labelStringName ? labelStringName : null);
  },

  // addSearchFolders -
  // supposed to recursively traverse the subfolders of a
  // given folder, marking them for inclusion in the dupe search;
  // however, it can't really do this in the straightforward way, as for
  // IMAP folders one needs to make sure they're ready before acting, so
  // instead, it only marks the current folder and has traverseSearchFolderSubfolders
  // called either synchronously or asynchronously to complete its work

  addSearchFolders : function(folder, searchData) {
#ifdef DEBUG_addSearchFolders
    console.log('addSearchFolders for folder ' + folder.abbreviatedName +
     '\nrootFolder = ' + folder.rootFolder + ((folder.rootFolder == folder) ? ' - self!' : ' - not self!') +
     '\ncanFileMessages = ' + folder.canFileMessages +
     '\nfolder.canRename = ' + folder.canRename
    );
#endif

    if (!folder.canRename && (folder.rootFolder != folder) ) {
      // it's a special folder
      if (searchData.skipSpecialFolders) {
        if (!(folder.flags & RemoveDupes.FolderFlags.Inbox)) {
          return;
        }
#ifdef DEBUG_addSearchFolders
        console.log('special folder ' + folder.abbreviatedName + ' is allowed');
#endif
      }
    }
    if (folder.flags & RemoveDupes.FolderFlags.Virtual) {
      // it's a virtual search folder, skip it
#ifdef DEBUG_addSearchFolders
      console.log('skipping virtual search folder ' + folder.abbreviatedName);
#endif
      return;
    }


    searchData.remainingFolders++;

    // Skipping folders which are not special, but by definition cannot
    // have duplicates

    // TODO: There may theoretically be other URI prefixes which we need to avoid
    // in addition to 'news://'

    if (folder.URI.substring(0,7) != 'news://') {
      if (searchData.originalsFolderUris) {
        if (!searchData.originalsFolderUris.has(folder.URI)) {
#ifdef DEBUG_addSearchFolders
          console.log('pushing non-originals folder ' + folder.abbreviatedName);
#endif
          searchData.folders.add(folder);
        }
#ifdef DEBUG_addSearchFolders
        else console.log('not pushing folder ' + folder.abbreviatedName + ' - it\'s an originals folder');
#endif
      }
      else {
#ifdef DEBUG_addSearchFolders
        console.log('pushing folder ' + folder.abbreviatedName);
#endif
        searchData.folders.add(folder);
      }
    }
#ifdef DEBUG_addSearchFolders
    else console.log('not pushing folder ' + folder.abbreviatedName + ' - since it has no root folder or can\'t file messages');
#endif

    // is this an IMAP folder?

    try {
      var imapFolder = folder.QueryInterface(Ci.nsIMsgImapMailFolder);
      var listener = new RemoveDupes.UpdateFolderDoneListener(folder,searchData);
      var dummyUrl = new Object;
      RemoveDupes.ImapService.selectFolder(RemoveDupes.MessengerOverlay.eventTarget, folder, listener, msgWindow, dummyUrl);
      // no traversal of children - the listener will take care of that in due time
#ifdef DEBUG_addSearchFolders
      console.log('returning from addSearchFolders for folder ' + folder.abbreviatedName + ':\ntriggered IMAP folder update');
#endif
      return;

    } catch (ex) {}

    // Is this a locally-stored folder with its DB out-of-date?

    try {
      var localFolder = folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
      try {
        var db = localFolder.getDatabaseWOReparse();
      } catch (ex) {
        var listener = new RemoveDupes.UpdateFolderDoneListener(folder,searchData);
        folder.parseFolder(msgWindow, listener);
        // no traversal of children - the listener will take care of that in due time
#ifdef DEBUG_addSearchFolders
        console.log('returning from addSearchFolders for folder ' + folder.abbreviatedName + ':\ntriggered local folder db update');
#endif
        return;
      }
    } catch (ex) {
    }

    // We assume at this point the folder is locally-stored and its message db is up-to-date,
    // so we can traverse its subfolders without any more preparation

    RemoveDupes.MessengerOverlay.traverseSearchFolderSubfolders(folder,searchData);

#ifdef DEBUG_addSearchFolders
    console.log('returning from addSearchFolders for folder ' + folder.abbreviatedName + ':\nperformed traversal');
#endif
  },

  // traverseSearchFolderSubfolders -
  // Completes the work of addSearchFolder by traversing a
  // folder's children once it's 'ready'; it is called asynchronously
  // for IMAP folders

  traverseSearchFolderSubfolders : function(folder,searchData) {
#ifdef DEBUG_traverseSearchFolderSubfolders
    console.log('in traverseSearchFolderSubfolders for folder ' + folder.abbreviatedName);
#endif

    RemoveDupes.MessengerOverlay.setNamedStatus('searching_for_dupes');

    if (searchData.searchSubfolders && folder.hasSubFolders) {
      // traverse the children
      var subFolders = folder.subFolders;
      if ('hasMoreElements' in subFolders) {
        // subFolders is an nsISimpleEnumerator (pre-TB-86; see bug 1682941)
        while (subFolders.hasMoreElements()) {
          RemoveDupes.MessengerOverlay.addSearchFolders(
            subFolders.getNext().QueryInterface(Ci.nsIMsgFolder),
            searchData);
        }
      }
      else {
        // subFolders is an nsIArray; this is what we expect in TB 86 and later
        for (let subFolder of subFolders) {
          RemoveDupes.MessengerOverlay.addSearchFolders(subFolder, searchData);
        }
      }
    }

    searchData.remainingFolders--;

#ifdef DEBUG_traverseSearchFolderSubfolders
    console.log('returning from traverseSearchFolderSubfolders for folder ' + folder.abbreviatedName);
#endif
  },

  // the folder collection for a dupe search happens asynchronously; this function
  // waits for the folder collection to conclude (sleeping and calling itself
  // again if it hasn't), before continuing to the collection of messages
  // from the folders

  waitForFolderCollection : function(searchData) {
#ifdef DEBUG_waitForFolderCollection
     console.log('in waitForFolderCollection\nsearchData.remainingFolders = ' + searchData.remainingFolders);
#endif

    RemoveDupes.MessengerOverlay.setNamedStatus('searching_for_dupes');

    if (searchData.userAborted) {
      abortDupeSearch(searchData,'search_aborted');
      return;
    }

    // ... but it might still be the case that we haven't finished
    // traversingfolders and collecting their subfolders for the dupe
    // search, so we may have to wait some more

    if (searchData.remainingFolders > 0) {
      setTimeout(RemoveDupes.MessengerOverlay.waitForFolderCollection,100,searchData);
      return;
    }
    RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase1(searchData);
  },

  // processMessagesInCollectedFoldersPhase1 -
  // Called after we've collected all of the folders
  // we need to process messages in. The processing of messages has
  // two phases - first, all messages are hashed into a possible-dupe-sets
  // hash, then the sets of messages with the same hash values are
  // refined using more costly comparisons than the hashing itself.
  // The processing can take a long time; to allow the UI to remain
  // responsive and the user to be able to abort the dupe search, we
  // perform the first phase using a generator and a separate function
  // which occasionally yields

  processMessagesInCollectedFoldersPhase1 : function(searchData) {
    // At this point all UrlListeners have finished their work, and all
    // relevant folders have been added to the searchData.folders array

    if (searchData.userAborted) {
      abortDupeSearch(searchData,'search_aborted');
      return;
    }

#ifdef DEBUG_collectMessages
     console.log('in continueSearchForDuplicateMessages');
#endif
    searchData.generator =
      RemoveDupes.MessengerOverlay.populateDupeSetsHash(searchData);
    setTimeout(
      RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase2,
      10, searchData);
  },

  // processMessagesInCollectedFoldersPhase2 -
  // A wrapper for the  'Phase2' function waits for the first phase to complete,
  // calling itself with a timeout otherwise; after performing the second phase,
  // it calls the post-search reviewAndRemoveDupes function (as we're working
  // asynchronously)

  processMessagesInCollectedFoldersPhase2 : function(searchData) {
    if (searchData.userAborted) {
      abortDupeSearch(searchData,'search_aborted');
      return;
    }
    // what happens if generator is null?
    if (searchData.generator) {
      var next = searchData.generator.next();
      if (!next.done) {
        setTimeout(
          RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase2,
          100, searchData);
        return;
      }
#ifdef DEBUG_processMessagesInCollectedFoldersPhase2
    console.log('populateDupeSetsHash execution complete');
#endif
      delete searchData.generator;
    }
    delete searchData.folders;

    // some criteria are not used when messages are first collected, so the
    // hash map of dupe sets might be a 'rough' partition into dupe sets, which
    // still needs to be refined by additional comparison criteria

    RemoveDupes.MessengerOverlay.refineDupeSets(searchData);

    if (searchData.userAborted) {
      abortDupeSearch(searchData,'search_aborted');
      return;
    }

    if (RemoveDupes.JS.isEmpty(searchData.dupeSetsHashMap)) {
      if (searchData.useReviewDialog) {
        // if the user wants a dialog to pop up for the dupes,
        // we can bother him/her with a message box for 'no dupes'
        RemoveDupes.MessengerOverlay.statusTextField.label = '';
        RemoveDupes.namedAlert(window, 'no_duplicates_found');
      }
      else {
        // if the user wanted silent removal, we'll be more quiet about telling
        // him/her there are no dupes
        RemoveDupes.MessengerOverlay.setNamedStatus('no_duplicates_found');
      }
      delete(searchData);
    }
    else {
      RemoveDupes.MessengerOverlay.setNamedStatus('search_complete');
      RemoveDupes.MessengerOverlay.reviewAndRemoveDupes(searchData);
      //document.getElementById('progress-panel').setAttribute('collapsed', true);
    }
  },

  // stripAndSortAddreses -
  // Takes a MIME header field (hopefully, decoded for appropriate charset
  // and transfer encoding), strips out the email addresses in it, and
  // returns them, sorted, in a string
  //
  // Note: This function may have issues when addresses are quoted
  // and/or when addresses are used within names preceding addresses, see
  //
  // https://www.mozdev.org/bugs/show_bug.cgi?id=23963
  // https://www.mozdev.org/bugs/show_bug.cgi?id=23964
  //

  stripAndSortAddresses : function(headerString) {
    const gEmailRegExp = RegExp(
      // recal that ?: at the beginning of the parenthesized sections
      // means we're not interested in remembering the matching for these
      // sections specificlaly
      //
      // disallowed email address beginning with an apostrophy (') to
      // better handle single-quoted addresses such as
      // 'my.addr@somewhere.com'
      "(?:\\b|^)[a-z0-9!#$%&*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@" +
      "(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\b|$)","gi");
    const gSingleQuotedEmailRegExp = RegExp(
      "(?:\\b|^)'[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@" +
      "(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'","gi");
    const gEncodedWordRegExp = RegExp("=\\?.*\\?=","g");
#ifdef DEBUG_stripAndSortAddresses
    console.log('stripAndSortAddresses(' + headerString +  ')');
#endif
    if ((headerString == null) || (headerString == ""))
      return headerString;
    // if we suspect there's undecoded text, let's not do anything and
    // keep the field the way it is; at worst, we'll have some false-non-dupes
    if (gEncodedWordRegExp.test(headerString))
      return headerString;
    var matches;
#ifdef DEBUG_stripAndSortAddresses
    console.log('headerString.match(gEmailRegExp) with gEmailRegExp = ' + gEmailRegExp);
#endif
    matches = headerString.match(gEmailRegExp);
    if (!matches) {
      // let's try looking for addresses within single quotes,
      // and clip the quotes
      matches = headerString.match(gSingleQuotedEmailRegExp);
      // again, if we can't get any addresses, let's stay with the
      // original header string rather than assume there are no addresses
      if (!matches) return headerString;
      for (let i = 0; i < matches.length; i++) {
        matches[i] = matches[i].substr(1,matches[i].length - 2);
      }
    }
    return matches.sort();
  },

  // sillyHash -
  // Calculates the hash used for the first-phase separation of non-dupe
  // messages; it relies on the non-expensive comparison criteria.
  //
  // Note: If a field is to be used in building the has, and is not a
  // typically-optional field (like CC list), but is missing from
  // the message - we either return null (in which case the message is to be
  // ignored and not classified as a dupe of anything), or assume all elements
  // with the missing field are the same w.r.t. this field.

  sillyHash : function(searchData, messageHdr, folder) {
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

    var retVal = '';
    if (searchData.useCriteria['message_id']) {
      let messageId = messageHdr.messageId;
      if (messageHdr.messageId.substr(0,4) == 'md5:' && !searchData.allowMD5IDSubstitutes) {
        // Note: We are making a (generally invalid) assumption that actual message headers don't
        // begin with 'md5:'.
        if (searchData.assumeEachMissingValueIsUnique) {
          return null;
        }
        messageId = 'md5:(scrubbed)Ui*r8Ou@Eex=ae6O';
      }
      // some mail servers add newlines and spaces before or after message IDs
      retVal += messageId.replace(/(\n|^)\s+|\s+$/,"") + '|';
    }
    if (searchData.useCriteria['send_time']) {
      if (searchData.compareTimeNumerically)
        retVal += messageHdr.dateInSeconds + '|';
      else {
        var date = new Date( messageHdr.dateInSeconds*1000 );
        switch(searchData.timeComparisonResolution) {
          case "seconds":
            retVal += date.getSeconds() + '|';
          case "minutes":
            retVal += date.getMinutes() + '|';
          case "hours":
            retVal += date.getHours() + '|';
          case "day":
            retVal += date.getDate() + '|';
          case "month":
            retVal += date.getMonth() + '|';
          case "year":
            retVal += date.getFullYear() + '|';
            break;
          default:
            // if someone uses an invalid comparison resolution,
            // they'll get a maximum-resolution comparison
            // to avoid false positives
            retVal += messageHdr.dateInSeconds + '|';
        }
      }
    }
    if (searchData.useCriteria['size']) {
      retVal += messageHdr.messageSize + '|';
    }
    if (searchData.useCriteria['folder']) {
      retVal += folder.URI + '|';
    }
    if (searchData.useCriteria['subject']) {
      if (messageHdr.subject == null && searchData.assumeEachMissingValueIsUnique) {
        return null;
      }
      retVal += messageHdr.subject + '|6xX$\WG-C?|';
        // the extra 'junk string' is intended to reduce the chance of getting the subject
        // field being mixed up with other fields in the hash, i.e. in case the subject
        // ends with something like "|55"
    }
    if (searchData.useCriteria['author']) {
      if (messageHdr.author == null && searchData.assumeEachMissingValueIsUnique) {
        return null;
      }
      retVal +=
        (searchData.compareStrippedAndSortedAddresses ?
         RemoveDupes.MessengerOverlay
                    .stripAndSortAddresses(messageHdr.mime2DecodedAuthor) :
         messageHdr.author)
        + '|^#=)A?mUi5|';
    }
    if (searchData.useCriteria['recipients']) {
      retVal += (searchData.compareStrippedAndSortedAddresses ?
         RemoveDupes.MessengerOverlay.stripAndSortAddresses(messageHdr.mime2DecodedRecipients) :
         messageHdr.recipients)
        + '|Ei4iXn=Iv*|';
    }
    // note:
    // We're stripping here the non-MIME-transfer-encoding-decoded CC list!
    // It might not work but we don't have immediate access to the decoded
    // version...
    if (searchData.useCriteria['cc_list']) {
      retVal += (searchData.compareStrippedAndSortedAddresses ?
         RemoveDupes.MessengerOverlay.stripAndSortAddresses(messageHdr.ccList) :
         messageHdr.ccList)
        + '|w7Exh\' s%k|';
    }
    if (searchData.useCriteria['num_lines']) {
      retVal += messageHdr.lineCount + '|';
    }
    if (searchData.useCriteria['flags']) {
      retVal += messageHdr.flags;
    }
    return retVal;
  },

  // The actual first phase of message processing (see
  // processMessagesInCollectedFoldersPhase1 for more details)

  populateDupeSetsHash : function*(searchData) {
#ifdef DEBUG_populateDupeSetsHash
     console.log('in populateDupeSetsHash()');
#endif

    // messageUriHashmap  will be filled with URIs for _all_ messages;
    // the dupe set hashmap will only have entries for dupes, and these
    // entries will be sets of dupes (technically, arrays of dupes)
    // rather than URIs
    var messageUriHashmap = new Object;

#ifdef DEBUG_populateDupeSetsHash
     if (searchData.originalsFolders) {
       console.log('number of search folders: ' +
         searchData.originalsFolders.size + ' originals + ' +
         searchData.folders.size + ' others' );
     }
     else console.log('Before iteration. Number of search folders: ' + searchData.folders.size);
#endif

    // This next bit of code is super-ugly, because I need the yield'ing to happen from
    // this function - can't yield from a function you're calling; isn't life great?
    // isn't lack of threading fun?
    //
    // Anyway, we want to have a function which takes an iterator into a collection of
    // folders, populating the hash with the messages in each folder - and run it twice,
    // first for the originals folder (allowing the creation of new dupe sets), then
    // for the search folders (allowing the creation of dupe sets if there are no originals,
    // and allowing the addition of dupes to existing sets

#ifdef DEBUG_populateDupeSetsHash
    var i = 0;
#endif

    var allowNewDupeSets = true;
    var doneWithOriginals;
    var foldersIterator;
    if (searchData.originalsFolders && searchData.originalsFolders.size != 0) {
      doneWithOriginals = false;
      foldersIterator = searchData.originalsFolders.values();
    }
    else {
      doneWithOriginals = true;
      foldersIterator = searchData.folders.values();
    }
    var maybeNext = foldersIterator.next();
#ifdef DEBUG_populateDupeSetsHash
    console.log('next()ed!');
#endif

    while (!maybeNext.done || !doneWithOriginals) {

#ifdef DEBUG_populateDupeSetsHash
      console.log('At iteration ' + i + '.');
#endif

      if (maybeNext.done) {
        // ... we continued looping since !doneWithOriginals . Now
        // let's move on to iterating the search folders.
        doneWithOriginals = true;
        if (searchData.folders.size == 0) {
          // this should really not happen...
          break;
        }
        foldersIterator = searchData.folders.values();
        allowNewDupeSets = (searchData.originalsFolders ? false : true);
        maybeNext = foldersIterator.next();
      }
      var folder = maybeNext.value.QueryInterface(Ci.nsIMsgFolder);
#ifdef DEBUG_populateDupeSetsHash
      if (i > 100) break;
#endif
      if (!folder) {

#ifdef DEBUG_populateDupeSetsHash
      console.log('populateDupeSetsHash got a supposed-folter to traverse which isn\'t a folder: ' + maybeNext.value);
#endif
        break;
      }
#ifdef DEBUG_populateDupeSetsHash
      console.log(
          'populateDupeSetsHash for folder ' + folder.abbreviatedName + '\n' +
          (allowNewDupeSets ? '' : 'not') + 'allowing new URIs');
#endif
      if (folder.isServer == true) {
        // shouldn't get here - these should have been filtered out already
        maybeNext = foldersIterator.next();
#ifdef DEBUG_populateDupeSetsHash
    console.log('next()ed!');
#endif
        continue;
      }

      var folderMessageHdrsIterator;
      try {
          folderMessageHdrsIterator = folder.messages;
      } catch(ex) {
        try {
          folderMessageHdrsIterator = folder.getMessages(msgWindow);
        } catch(ex) {
          console.error('Failed obtaining the messages iterator for folder ${folder.name}');
          console.error(RemoveDupes.Strings.format('failed_getting_messages', [folder.name]) + '\n');
          dump(RemoveDupes.Strings.format('failed_getting_messages', [folder.name]) + '\n');
        }
      }

      if (! folderMessageHdrsIterator) {
        console.error('The messages iterator for folder ${folder.name} is null');
        console.error(RemoveDupes.Strings.format('failed_getting_messages', [folder.name]) + '\n');
        dump(RemoveDupes.Strings.format('failed_getting_messages', [folder.name]) + '\n');
#ifdef DEBUG_populateDupeSetsHash
        i++;
#endif
        maybeNext = foldersIterator.next();
#ifdef DEBUG_populateDupeSetsHash
        console.log('next()ed!');
#endif
        continue;
      }

      while (   folderMessageHdrsIterator.hasMoreElements()
             && (!searchData.limitNumberOfMessages
                 || (searchData.messagesHashed < searchData.maxMessages)) ) {
        var messageHdr =
          folderMessageHdrsIterator.getNext().QueryInterface(Ci.nsIMsgDBHdr);

        if (   (searchData.skipIMAPDeletedMessages)
            && (messageHdr.flags & RemoveDupes.MessageStatusFlags['IMAP_DELETED'])) {
          // TODO: Consider checking the time elapsed & possibly yielding, even when
          //  iterating IMAP-deleted messages
          continue;
        }

        var messageHash = RemoveDupes.MessengerOverlay.sillyHash(searchData,messageHdr,folder);
        if (messageHash == null) {
#ifdef DEBUG_populateDupeSetsHash
          console.log('null hash - skipping the message');
#endif
          continue; // something about the message made us not be willing to compare it against other messages
        }
        var uri = folder.getUriForMsg(messageHdr);

        if (messageHash in messageUriHashmap) {
          if (messageHash in searchData.dupeSetsHashMap) {
#ifdef DEBUG_populateDupeSetsHash
            console.log('RemoveDupes.MessengerOverlay.sillyHash\n' + messageHash + '\nis a third-or-later dupe');
#endif
            // just add the current message's URI, no need to copy anything
            searchData.dupeSetsHashMap[messageHash].push(uri);
          }
          else {
#ifdef DEBUG_populateDupeSetsHash
            console.log('RemoveDupes.MessengerOverlay.sillyHash\n' + messageHash + '\nis a second dupe');
#endif
            // the URI in messageUriHashmap[messageHash] has not been copied to
            // the dupes hash since until now we did not know it was a dupe;
            // copy it together with our current message's URI
            // TODO: use [blah, blah] as the array constructor
            searchData.dupeSetsHashMap[messageHash] =
              new Array(messageUriHashmap[messageHash], uri);
            searchData.totalOriginalDupeSets++;
          }
        }
        else {
#ifdef DEBUG_populateDupeSetsHash
          console.log('RemoveDupes.MessengerOverlay.sillyHash\n' + messageHash + '\nis not a dupe (or a first dupe)');
#endif
          if (allowNewDupeSets) {
            messageUriHashmap[messageHash] = uri;
          }
        }

        searchData.messagesHashed++;
        var currentTime = (new Date()).getTime();
        if (currentTime - searchData.lastStatusBarReport > searchData.reportQuantum) {
          searchData.lastStatusBarReport = currentTime;
          RemoveDupes.MessengerOverlay.statusTextField.label =
            RemoveDupes.Strings.format('hashed_x_messages', [searchData.messagesHashed]);
        }
        if (currentTime - searchData.lastYield > searchData.yieldQuantum) {
          searchData.lastYield = currentTime;
          yield undefined;
        }
      }
#ifdef DEBUG_populateDupeSetsHash
      i++;
#endif
      maybeNext = foldersIterator.next();
#ifdef DEBUG_populateDupeSetsHash
      console.log('next()ed!');
#endif
    }
  },

  // messageBodyFromURI -
  // An 'expensive' function used in the second phase of messgage
  // processing, in which suspected sets of dupes are refined

  messageBodyFromURI : function(msgURI) {
    var msgContent = "";
#ifdef DEBUG_messageBodyFromURI
     console.log('in messageBodyFromURI(' + msgURI + ')');
#endif
    var MsgService;
    try {
      MsgService = messenger.messageServiceFromURI(msgURI);
    } catch (ex) {
#ifdef DEBUG_messageBodyFromURI
      console.log('Error getting message service for message ' + msgURI + '\n: ' + ex);
#endif
      return null;
    }
    var MsgStream =  Cc["@mozilla.org/network/sync-stream-listener;1"].createInstance();
    var consumer = MsgStream.QueryInterface(Ci.nsIInputStream);
    var ScriptInput = Cc["@mozilla.org/scriptableinputstream;1"].createInstance();
    var ScriptInputStream = ScriptInput.QueryInterface(Ci.nsIScriptableInputStream);
    ScriptInputStream.init(consumer);
    try {
      MsgService .streamMessage(msgURI, MsgStream, msgWindow, null, false, null);
    } catch (ex) {
#ifdef DEBUG_messageBodyFromURI
      console.log('Error getting message content for message ' + msgURI + ':\n' + ex);
#endif
      return null;
    }
    ScriptInputStream.available();
    while (ScriptInputStream.available()) {
      msgContent = msgContent + ScriptInputStream.read(512);
    }

    // the message headers end on the first empty line, and lines are delimited
    // by \n's or \r\n's ; of course, this is a very lame hack, since if the
    // message has multiple MIME parts we're still getting the headers of all
    // the sub-parts, and not taking into any account the multipart delimiters
    var endOfHeaders = /\r?\n\r?\n/;
    if (endOfHeaders.test(msgContent)) {
#ifdef DEBUG_messageBodyFromURI
    //console.log('msgContent =\n\n' + msgContent);
    //console.log('msgContent =\n\n' + string2hexWithNewLines(msgContent));
    console.log('RegExp.rightContext =\n\n' + RegExp.rightContext);
#endif
      // return everything after the end-of-headers
      return RegExp.rightContext;
    }
#ifdef DEBUG_messageBodyFromURI
    console.log('Can\'t match /\\r?\\n\\r?\\n/');
#endif
    return null;
  },

  // Write some progress info to the status bar

  reportRefinementProgress : function(searchData,activity,setSize,curr) {
    var currentTime = (new Date()).getTime();
    if (currentTime - searchData.lastStatusBarReport > searchData.reportQuantum) {
      searchData.lastStatusBarReport = (new Date()).getTime();
      switch (activity) {
        case 'bodies':
          RemoveDupes.MessengerOverlay.statusTextField.label =
            RemoveDupes.Strings.format(
              'refinement_status_getting_bodies',
              [searchData.setsRefined,
               searchData.totalOriginalDupeSets,
               curr,
               setSize
              ]);
          break;
        case 'subsets':
          RemoveDupes.MessengerOverlay.statusTextField.label =
            RemoveDupes.Strings.format(
              'refinement_status_building_subsets',
              [searchData.setsRefined,
               searchData.totalOriginalDupeSets,
               setSize-curr,
               setSize
              ]);
          break;
      }
    }
  },

  // The actual second phase of message processing (see
  // processMessagesInCollectedFoldersPhase2 for more details)

  refineDupeSets : function(searchData) {
    if (!searchData.useCriteria['body'])
      return;

    // we'll split every dupe set into separate sets based on additional
    // comparison criteria (the more 'expensive' ones); size-1 dupe sets
    // are removed from the hash map entirely.

    // TODO: for now, our only 'expensive' criterion is the message body,
    // so I'm leaving the actual comparison code in this function and
    // not even checking for searchData.useBody; if and when we get additional
    // criteria this should be rewritten so that dupeSet[i] gets
    // a comparison record created for it, then for every j we call
    // ourcomparefunc(comparisonrecord, dupeSet[j])

    for (let hashValue in searchData.dupeSetsHashMap) {
      var dupeSet = searchData.dupeSetsHashMap[hashValue];
#ifdef DEBUG_refineDupeSets
      console.log('refining for dupeSetsHashMap value ' + hashValue + '\nset has ' + dupeSet.length + ' elements initially');
#endif

      // get the message bodies

      var initialSetSize = dupeSet.length;

      for (let i=0; i < dupeSet.length; i++) {
        var dupeUri = dupeSet[i];
        dupeSet[i] = {
          uri: dupeUri,
          body: RemoveDupes.MessengerOverlay.messageBodyFromURI(dupeUri)
        }
        if (searchData.userAborted)
          return;
        RemoveDupes.MessengerOverlay.reportRefinementProgress(searchData, 'bodies', initialSetSize, i);
      }

#ifdef DEBUG_refineDupeSets
      console.log('got the bodies');
#endif

      // sort the bodies

      dupeSet.sort(
        function(lhs,rhs) {
          return lhs - rhs;
        } );

#ifdef DEBUG_refineDupeSets
      console.log('done sorting');
#endif

      if (searchData.userAborted)
        return;

      // now build sub-dupesets from identical-body sequences of the sorted array

      var subsetIndex = 0;
      while(dupeSet.length > 0) {
        if (searchData.userAborted) {
          return;
        }
        if (!dupeSet[0].body) {
          dupeSet.shift();
          continue;
        }
        let subsetLength = 1;
        while( (subsetLength < dupeSet.length) &&
                 (dupeSet[subsetLength].body == dupeSet[0].body) ) {
            subsetLength++;
            dupeSet[subsetLength-1] = dupeSet[subsetLength-1].uri;
        }
        if (subsetLength > 1) {
            dupeSet[0] = dupeSet[0].uri;
            searchData.dupeSetsHashMap[hashValue + '|' + (subsetIndex++)] = dupeSet.splice(0,subsetLength);
        }
        else dupeSet.shift();
        RemoveDupes.MessengerOverlay.reportRefinementProgress(searchData, 'subsets', initialSetSize, dupeSet.length);

      }
      delete searchData.dupeSetsHashMap[hashValue];
      searchData.setsRefined++;
    }
  },

  // reviewAndRemoveDupes -
  // This function either moves the dupes, erases them completely,
  // or fires the review dialog for the user to decide what to do

  reviewAndRemoveDupes : function(searchData) {
#ifdef DEBUG_reviewAndRemove
    console.log('in reviewAndRemoveDupes');
#endif

    if (searchData.userAborted) {
      abortDupeSearch(searchData,'search_aborted');
    }
    window.removeEventListener("keypress", searchData.keyPressEventListener, true);

    if (!searchData.useReviewDialog)
    {
      let deletePermanently =
        (RemoveDupes.Prefs.getCharPref('default_action', 'move') == 'delete_permanently');
      let targetFolder = deletePermanently ?
        null :
        RemoveDupes.Prefs.getCharPref('default_target_folder', RemoveDupes.Removal.getLocalFoldersTrashFolder().URI);
      // remove (move to trash or erase completely)
      // without user confirmation or review; we're keeping the first dupe
      // in every sequence of dupes and deleting the rest
      RemoveDupes.Removal.removeDuplicates(
        window,
        msgWindow,
        searchData.dupeSetsHashMap,
        deletePermanently,
        RemoveDupes.Prefs.getBoolPref("confirm_permanent_deletion", true),
        targetFolder,
        false // the uri's have not been replaced with messageRecords
        );
    }
    else {
      let xulSuffix = (RemoveDupes.App.versionIsAtLeast("69.0") ? "xhtml" : "xul");
      let dialogURI = "chrome://removedupes/content/removedupes-dialog." + xulSuffix;

#ifdef DEBUG_reviewAndRemove
      console.log("Using review dialog at " + dialogURI);
#endif

      // open up a dialog in which the user sees all dupes we've found,
      // and can decide which to delete
      window.openDialog(
        dialogURI,
        "removedupes",
        "chrome,resizable=yes",
        messenger,
        msgWindow,
        gDBView,
        searchData.useCriteria,
        searchData.dupeSetsHashMap,
        searchData.originalsFolderUris,
        searchData.allowMD5IDSubstitutes);
    }
    delete searchData;
  },

  toggleDupeSearchCriterion : function(ev,criterion) {
    var useCriterion =
      !RemoveDupes.Prefs.getBoolPref("comparison_criteria." + criterion,
        RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults[criterion]);
    RemoveDupes.Prefs.setBoolPref("comparison_criteria." + criterion, useCriterion);
    document.getElementById('removedupesCriterionMenuItem_' + criterion).setAttribute("checked", useCriterion ? "true" : "false");
    ev.stopPropagation();
  },

  criteriaPopupMenuInit : function() {
    for (let criterion in RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults) {
      document.getElementById('removedupesCriterionMenuItem_' + criterion)
              .setAttribute("checked",
                (RemoveDupes.Prefs.getBoolPref("comparison_criteria." + criterion,
                  RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults[criterion]) ? "true" : "false"));
    }
  },

  // This function is only used if the gFolderTreeView object is available
  // (for now, in TBird 3.x and later but not in Seamonkey 2.1.x and earlier);
  // it replaces the callback for getting folder tree cell properties with
  // a function which also adds the property of being a removedupes originals
  // folder or not.

  replaceGetCellProperties : function () {

    if (typeof gFolderTreeView == 'undefined')
      return;
    gFolderTreeView.preRDGetCellProperties = gFolderTreeView.getCellProperties;

    if(RemoveDupes.App.versionIsAtMost("17.1")) {
      var atomService = Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);
      gFolderTreeView.getCellProperties = function newGcp(aRow, aCol, aProps) {
        gFolderTreeView.preRDGetCellProperties(aRow, aCol, aProps);
        var row = gFolderTreeView._rowMap[aRow];
        if (RemoveDupes.MessengerOverlay.originalsFolderUris && RemoveDupes.MessengerOverlay.originalsFolderUris.has(row._folder.URI)) {
          aProps.AppendElement(atomService.getAtom("isOriginalsFolder-true"));
        }
        else {
          aProps.AppendElement(atomService.getAtom("isOriginalsFolder-false"));
        }
      };
      return;
    }
    if(RemoveDupes.App.versionIsAtLeast("23.0")) {
      gFolderTreeView.getCellProperties = function newGcp(aRow, aCol) {
        var properties = gFolderTreeView.preRDGetCellProperties(aRow, aCol);
        var row = gFolderTreeView._rowMap[aRow];
        if (RemoveDupes.MessengerOverlay.originalsFolderUris && RemoveDupes.MessengerOverlay.originalsFolderUris.has(row._folder.URI)) {
          properties += " isOriginalsFolder-true";
        }
        return properties;
      };
    }
  },

  setOriginalsFolders : function() {
    if (typeof gFolderTreeView == 'undefined') {
      var selectedMsgFolders = GetSelectedMsgFolders();
      RemoveDupes.MessengerOverlay.originalsFolders = new Set;
      RemoveDupes.MessengerOverlay.originalsFolderUris = new Set;
      for (let i = 0; i < selectedMsgFolders.length; i++) {
        RemoveDupes.MessengerOverlay.originalsFolders.add(RemoveDupes.MessengerOverlay.originalsFolders[i]);
        RemoveDupes.MessengerOverlay.originalsFolderUris.add(RemoveDupes.MessengerOverlay.originalsFolders[i].URI);
      }
      return;
    }

    // at this point we assume the gFolderTreeView object exists,
    // i.e. we can set custom properties for folders in the tree

    var selection = gFolderTreeView._treeElement.view.selection;
    var rangeCount = selection.getRangeCount();
    var numSelectedFolders = 0;
    RemoveDupes.MessengerOverlay.originalsFolders = new Set;
    RemoveDupes.MessengerOverlay.originalsFolderUris = new Set;
    var skipSpecialFolders =
      RemoveDupes.Prefs.getBoolPref('skip_special_folders','true');
    for (let i = 0; i < rangeCount; i++) {
      let startIndex = {};
      let endIndex = {};
      selection.getRangeAt(i, startIndex, endIndex);
      for (let j = startIndex.value; j <= endIndex.value; j++) {
        if (j >= gFolderTreeView._rowMap.length)
          break;

        var folder = gFolderTreeView._rowMap[j]._folder;
        if (skipSpecialFolders) {
          if (!folder.canFileMessages ||
              (folder.rootFolder == folder) ||
              (!folder.canRename &&
              (!(folder.flags & RemoveDupes.FolderFlags.Inbox)))) {
            RemoveDupes.namedAlert(window, 'invalid_originals_folders');
            continue;
          }
        }
        RemoveDupes.MessengerOverlay.originalsFolders.add(folder);
        RemoveDupes.MessengerOverlay.originalsFolderUris.add(folder.URI);
      }
    }
    gFolderTreeView._tree.invalidate();

    // TODO: Think of what happens if the user first marks the originals folders,
    // then changes the special folder skipping prefs; if we could clear the originals
    // in that case somehow...
  }

} // RemoveDupes.MessengerOverlay


//---------------------------------------------------
// a class definition of the listener which we'll
// need for recursively traversing IMAP folder hierarchies,
// in which each folder needs to be asyncrhonously updated
// with its on-server contents
//---------------------------------------------------
RemoveDupes.UpdateFolderDoneListener = function (folder,searchData) {
  this.folder = folder;
  this.searchData = searchData;
}

RemoveDupes.UpdateFolderDoneListener.prototype.QueryInterface =
  function(iid) {
    if (iid.equals(Ci.nsIUrlListener) ||
        iid.equals(Ci.nsISupports))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  };

RemoveDupes.UpdateFolderDoneListener.prototype.OnStartRunningUrl =
  function(url) {
#ifdef DEBUG_UpdateFolderDoneListener
   console.log('OnStartRunningUrl for folder ' + this.folder.abbreviatedName);
#endif
  }

RemoveDupes.UpdateFolderDoneListener.prototype.OnStopRunningUrl =
  function(url, exitCode) {
#ifdef DEBUG_UpdateFolderDoneListener
   console.log('OnStopRunningUrl for folder ' + this.folder.abbreviatedName);
#endif
    // TODO: Perhaps we should actually check the exist code...
    // for now we'll just assume the folder update wen't ok,
    // or we'll fail when trying to traverse the children
    RemoveDupes.MessengerOverlay.traverseSearchFolderSubfolders(this.folder,this.searchData);
  };
//---------------------------------------------------


// a class for holding the search parameters (instead of
// using a bunch of globals)
//---------------------------------------------------
RemoveDupes.DupeSearchData = function ()
{
  this.searchSubfolders =
    RemoveDupes.Prefs.getBoolPref("search_subfolders");

  this.useCriteria = new Object;
  // which information will we use for comparing messages?
  for (let criterion in RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults) {
    this.useCriteria[criterion] =
     RemoveDupes.Prefs.getBoolPref("comparison_criteria." + criterion,
                RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults[criterion]);
  }

  // an optimization: if we're comparing bodies, there shouldn't be any harm
  // in comparing by number of lines first

  this.useCriteria['num_lines'] =
    this.useCriteria['num_lines'] || this.useCriteria['body'];

#ifdef DEBUG_DupeSearchParameters
  console.log('USE criteria: '
    + (this.useCriteria['message_id'] ? 'message-ID ' : '')
    + (this.useCriteria['send_time'] ? 'send-time ' : '')
    + (this.useCriteria['size'] ? 'size ' : '')
    + (this.useCriteria['folder'] ? 'folder ' : '')
    + (this.useCriteria['subject'] ? 'subject ' : '')
    + (this.useCriteria['author'] ? 'author ' : '')
    + (this.useCriteria['num_lines'] ? 'line-count ' : '')
    + (this.useCriteria['recipients'] ? 'recipients ' : '')
    + (this.useCriteria['cc_list'] ? 'CC-list ' : '')
    + (this.useCriteria['flags'] ? 'Flags ' : '')
    + (this.useCriteria['body']? 'body ' : '')
    );
  console.log('DON\'T USE criteria: '
    + (!this.useCriteria['message_id'] ? 'message-ID ' : '')
    + (!this.useCriteria['send_time'] ? 'send-time ' : '')
    + (!this.useCriteria['size'] ? 'size ' : '')
    + (!this.useCriteria['folder'] ? 'folder ' : '')
    + (!this.useCriteria['subject'] ? 'subject ' : '')
    + (!this.useCriteria['author'] ? 'author ' : '')
    + (!this.useCriteria['num_lines'] ? 'line-count ' : '')
    + (!this.useCriteria['recipients'] ? 'recipients ' : '')
    + (!this.useCriteria['cc_list'] ? 'CC-list ' : '')
    + (!this.useCriteria['flags'] ? 'Flags ' : '')
    + (!this.useCriteria['body']? 'body ' : '')
    );
#endif

  // when messages have no Message-ID header, Mozilla uses their MD5
  // digest value; however, the implementation is somewhat buggy and
  // two copies of the same message reportedly get different MD5s
  // sometimes; plus, it's not _really_ the message ID

  this.allowMD5IDSubstitutes =
    RemoveDupes.Prefs.getBoolPref("allow_md5_id_substitute",false);

  // Sometimes, a criterion or field we're using as a comparison
  // criteria is missing. In these cases, we have the following options:
  //
  // 1. Be cautious, and assume the field does actually have some value
  //    and we just don't have access to it; in which case, we need to
  //    assume that value is distinct from all other messages - hence
  //    the message with the missing header cannot be considered a
  //    duplicate of any other message.
  // 2. Treat "missing" as a single distinct value, so that messages
  //    with this field missing can match each other as dupes, but
  //    cannot be considered dupes of any message which does have a
  //    value for this field. A missing field will not be the same as
  //    an empty field!
  // 3. Equate the missing field with an empty value; similar to the
  //    previous option, but such messages can be considered dupes
  //    of messages with an empty value for
  // 4. Assume the message can match _any_ message on ths missing field.
  //    This is the "anti-conservative" assumption.
  //
  // Since we tend to err on the conservative side, we will offer options
  // 1 and 2 only. A boolean option controls this choice.
  //
  // Note that if an MD5 is used instead of a field (e.g. the subject),
  // and is indeed present, we don't even consider that a case of a
  // missing header for purpose of the above choice.

  this.assumeEachMissingValueIsUnique =
    RemoveDupes.Prefs.getBoolPref("assume_each_missing_value_is_unique", true);


  // When comparing fields with address (recipients and CC list),
  // do we compare the fields in the way and order they appear in
  // the field, or do we canonicalize the fields by taking the
  // addresses only and sorting them?

  this.compareStrippedAndSortedAddresses =
    RemoveDupes.Prefs.getBoolPref("compare_stripped_and_sorted_addresses", false);

  this.timeComparisonResolution =
    RemoveDupes.Prefs.getCharPref("time_comparison_resolution", "seconds");
  this.compareTimeNumerically =
    (this.timeComparisonResolution == "seconds");


  // which of the special folders (inbox, sent, etc.) will we be willing
  // to search in for duplicates?

  this.skipSpecialFolders =
    RemoveDupes.Prefs.getBoolPref("skip_special_folders", true);

  this.skipIMAPDeletedMessages =
    RemoveDupes.Prefs.getBoolPref("skip_imap_deleted_messages", true);

  this.useReviewDialog =
    RemoveDupes.Prefs.getBoolPref("use_dialog_before_removal", true);

  // we might have to trigger non-blocking IMAP folder updates;
  // each trigger will increase this, each folder update completing
  // will decrease this
  this.remainingFolders = 0;

  this.dupeSetsHashMap = new Object;
  this.folders = new Set;

  // these are used for reporting progress in the status bar
  this.messagesHashed = 0;
  this.setsRefined = 0;
  this.totalOriginalDupeSets = 0;

  // maximum number of messages to process
  this.limitNumberOfMessages =
    RemoveDupes.Prefs.getBoolPref("limit_number_of_processed_messages", false);
#ifdef DEBUG_DupeSearchParameters
     console.log('this.limitNumberOfMessages ' + this.limitNumberOfMessages);
#endif
  this.maxMessages =
    RemoveDupes.Prefs.getIntPref("processed_messages_limit", 10000);
#ifdef DEBUG_DupeSearchParameters
     console.log('this.maxMessages ' + this.maxMessages);
#endif

  // timing is used to decide when to make the next status
  // bar progress report and for yielding for processing UI events
  // (values here are in miliseconds)
  this.lastStatusBarReport = this.lastYield = (new Date()).getTime();
  this.yieldQuantum =
    RemoveDupes.Prefs.getIntPref("yield_quantum", 200);
  this.reportQuantum =
    RemoveDupes.Prefs.getIntPref("status_report_quantum", 1500);

  if (RemoveDupes.MessengerOverlay.originalsFolders) {
    this.originalsFolderUris = RemoveDupes.MessengerOverlay.originalsFolderUris;
    this.originalsFolders = RemoveDupes.MessengerOverlay.originalsFolders;
  }
  else {
    // Just to avoid some JS warnings later about using a non-existent member
    this.originalsFolderUris = null
  }
}
//---------------------------------------------------


window.addEventListener("load", RemoveDupes.MessengerOverlay.replaceGetCellProperties, false);
// this is not useful unless the event fires after all folder have
// been created - which is not the case
