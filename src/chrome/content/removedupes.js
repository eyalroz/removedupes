var { RemoveDupes  } = ChromeUtils.importESModule("chrome://removedupes/content/removedupes-common.sys.mjs");
var { ObjectUtils  } = ChromeUtils.importESModule("resource://gre/modules/ObjectUtils.sys.mjs");
var { ImapService  } = ChromeUtils.importESModule("resource://gre/modules/ImapService.sys.mjs");
var { MailUtils    } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

RemoveDupes.MessengerOverlay = {};

// These default criteria are used in the dupe search if their corresponding preferences are not set
RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults = {
  message_id: true,
  send_time: true,
  size: true,
  folder: true,
  subject: true,
  author: true,
  line_count: false,
  recipients: false,
  cc_list: false,
  flags: false,
  body: false
};

RemoveDupes.MessengerOverlay.originalsFolders = null;
RemoveDupes.MessengerOverlay.originalsFolderUris = null;

// searchAndRemoveDuplicateMessages -
// Called from the UI to trigger a new dupe search

RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages = function () {
  // document.getElementById('progress-panel').removeAttribute('collapsed');
  window.statusFeedback.startMeteors();
  RemoveDupes.StatusBar.setNamedStatus(window, 'searching_for_dupes');

  // we'll need this for some calls involving UrlListeners

  let searchData = new RemoveDupes.DupeSearchData();
  // the marked 'originals folders' are only used as such
  // for this coming search, not for subsequent searches
  this.originalsFolders = null;
  this.originalsFolderUris = null;
  if (typeof gFolderTreeView != 'undefined' && gFolderTreeView) {
    gFolderTreeView._tree.invalidate();
  }
  searchData.keyPressEventListener = (ev) => { this.onKeyPress(ev, searchData); };
  window.addEventListener("keypress", searchData.keyPressEventListener, true);
  this.beginSearchForDuplicateMessages(searchData);
};

RemoveDupes.MessengerOverlay.onKeyPress = function (ev, searchData) {
  if ((ev.code == KeyEvent.DOM_VK_CANCEL ||
       ev.code == KeyEvent.DOM_VK_ESCAPE ||
       ev.code == KeyEvent.DOM_VK_BACK_SPACE) &&
      !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
    searchData.userAborted = true;
  }
};

RemoveDupes.MessengerOverlay.beginSearchForDuplicateMessages = function (searchData) {
  searchData.topFolders = GetSelectedMsgFolders();

  if (searchData.topFolders.length == 0) {
    // no folders selected; we shouldn't get here
    RemoveDupes.MessengerOverlay.abortDupeSearch(searchData, 'no_folders_selected');
    return;
  }

  // TODO: check we haven't selected some folders along with
  // their subfolders - this would mean false dupes!

  for (let i = 0; i < searchData.topFolders.length; i++) {
    let folder = searchData.topFolders[i];
    if (searchData.skipSpecialFolders) {
      if (!folder.canRename && (folder.rootFolder != folder)) {
        // one of the top folders is a special folders; if it's not
        // the Inbox (which we do search), skip it
        if (!(folder.flags & RemoveDupes.FolderFlags.Inbox)) {
          continue;
        }
      }
    }
    RemoveDupes.MessengerOverlay.addSearchFolders(folder, searchData);
  }

  if (searchData.folders.size == 0) {
    // all top folders were special folders and therefore skipped
    RemoveDupes.MessengerOverlay.abortDupeSearch(searchData);
    RemoveDupes.namedAlert(window, 'not_searching_special_folders');
    return;
  }

  delete searchData.topFolders;

  // At this point, one would expect searchData.folders to contain
  // all the folders and subfolders we're collecting messages from -
  // but, alas this cannot be... We have to wait for all the IMAP
  // folders and subfolders to become ready and then be processed;
  // so let's call a sleep-poll function

  RemoveDupes.MessengerOverlay.waitForFolderCollection(searchData);
};

RemoveDupes.MessengerOverlay.abortDupeSearch = function (searchData, labelStringName) {
  window.removeEventListener("keypress", searchData.keyPressEventListener, true);
  searchData = null;
  window.statusFeedback.stopMeteors();
  if (labelStringName) {
    RemoveDupes.StatusBar.setNamedStatus(window, labelStringName);
  } else {
    RemoveDupes.StatusBar.setStatus(window, '');
  }
};

// addSearchFolders -
// supposed to recursively traverse the subfolders of a
// given folder, marking them for inclusion in the dupe search;
// however, it can't really do this in the straightforward way, as for
// IMAP folders one needs to make sure they're ready before acting, so
// instead, it only marks the current folder and has traverseSearchFolderSubfolders
// called either synchronously or asynchronously to complete its work

RemoveDupes.MessengerOverlay.addSearchFolders = function (folder, searchData) {
  if (!folder.canRename && (folder.rootFolder != folder)) {
    // it's a special folder
    if (searchData.skipSpecialFolders) {
      if (!(folder.flags & RemoveDupes.FolderFlags.Inbox)) {
        return;
      }
    }
  }
  if (folder.flags & RemoveDupes.FolderFlags.Virtual) {
    // it's a virtual search folder, skip it
    return;
  }


  searchData.remainingFolders++;

  // Skipping folders which are not special, but by definition cannot
  // have duplicates

  // TODO: There may theoretically be other URI prefixes which we need to avoid
  // in addition to 'news://'

  if (folder.URI.substring(0, 7) != 'news://') {
    if (searchData.originalsFolderUris) {
      if (!searchData.originalsFolderUris.has(folder.URI)) {
        searchData.folders.add(folder);
      }
    } else {
      searchData.folders.add(folder);
    }
  }

  // is this an IMAP folder?

  try {
    let listener = new RemoveDupes.UpdateFolderDoneListener(folder, searchData);
    ImapService.liteSelectFolder(folder, listener, msgWindow);
    // no traversal of children - the listener will take care of that in due time
    return;
  } catch (ex) {}

  // Is this a locally-stored folder with its DB out-of-date?

  try {
    let localFolder = folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
    try {
      localFolder.getDatabaseWOReparse();
    } catch (ex) {
      let listener = new RemoveDupes.UpdateFolderDoneListener(folder, searchData);
      folder.parseFolder(msgWindow, listener);
      // no traversal of children - the listener will take care of that in due time
      return;
    }
  } catch (ex) {
  }

  // We assume at this point the folder is locally-stored and its message db is up-to-date,
  // so we can traverse its subfolders without any more preparation

  RemoveDupes.MessengerOverlay.traverseSearchFolderSubfolders(folder, searchData);
};

// traverseSearchFolderSubfolders -
// Completes the work of addSearchFolder by traversing a
// folder's children once it's 'ready'; it is called asynchronously
// for IMAP folders

RemoveDupes.MessengerOverlay.traverseSearchFolderSubfolders = function (folder, searchData) {
  RemoveDupes.StatusBar.setNamedStatus(window, 'searching_for_dupes');

  if (searchData.searchSubfolders && folder.hasSubFolders) {
    for (let subFolder of folder.subFolders) {
      RemoveDupes.MessengerOverlay.addSearchFolders(subFolder, searchData);
    }
  }

  searchData.remainingFolders--;
};

// the folder collection for a dupe search happens asynchronously; this function
// waits for the folder collection to conclude (sleeping and calling itself
// again if it hasn't), before continuing to the collection of messages
// from the folders

RemoveDupes.MessengerOverlay.waitForFolderCollection = function (searchData) {
  RemoveDupes.StatusBar.setNamedStatus(window, 'searching_for_dupes');

  if (searchData.userAborted) {
    RemoveDupes.MessengerOverlay.abortDupeSearch(searchData, 'search_aborted');
    return;
  }

  // ... but it might still be the case that we haven't finished
  // traversing folders and collecting their subfolders for the dupe
  // search, so we may have to wait some more

  if (searchData.remainingFolders > 0) {
    setTimeout(this.waitForFolderCollection, 100, searchData);
    return;
  }
  RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase1(searchData);
};

// processMessagesInCollectedFoldersPhase1 -
// Called after we've collected all the folders
// we need to process messages in. The processing of messages has
// two phases - first, all messages are hashed into a possible-dupe-sets
// hash, then the sets of messages with the same hash values are
// refined using more costly comparisons than the hashing itself.
// The processing can take a long time; to allow the UI to remain
// responsive and the user to be able to abort the dupe search, we
// perform the first phase using a generator and a separate function
// which occasionally yields

RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase1 = function (searchData) {
  // At this point all UrlListeners have finished their work, and all
  // relevant folders have been added to the searchData.folders array

  if (searchData.userAborted) {
    RemoveDupes.MessengerOverlay.abortDupeSearch(searchData, 'search_aborted');
    return;
  }

  searchData.generator = this.populateDupeSetsHash(searchData);
  setTimeout(this.processMessagesInCollectedFoldersPhase2, 10, searchData);
};

// processMessagesInCollectedFoldersPhase2 -
// A wrapper for the  'Phase2' function waits for the first phase to complete,
// calling itself with a timeout otherwise; after performing the second phase,
// it calls the post-search reviewAndRemoveDupes function (as we're working
// asynchronously)

RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase2 = function (searchData) {
  if (searchData.userAborted) {
    RemoveDupes.MessengerOverlay.abortDupeSearch(searchData, 'search_aborted');
    return;
  }
  // what happens if generator is null?
  if (searchData.generator) {
    let next = searchData.generator.next();
    if (!next.done) {
      setTimeout(
        RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase2,
        100, searchData);
      return;
    }
    delete searchData.generator;
  }
  delete searchData.folders;

  // some criteria are not used when messages are first collected, so the
  // hash map of dupe sets might be a 'rough' partition into dupe sets, which
  // still needs to be refined by additional comparison criteria

  RemoveDupes.MessengerOverlay.refineDupeSets(searchData);

  if (searchData.userAborted) {
    RemoveDupes.MessengerOverlay.abortDupeSearch(searchData, 'search_aborted');
    return;
  }

  window.statusFeedback?.stopMeteors?.();
  if (ObjectUtils.isEmpty(searchData.dupeSetsHashMap)) {
    if (searchData.useReviewDialog) {
      // if the user wants a dialog to pop up for the dupes,
      // we can bother him/her with a message box for 'no dupes'
      RemoveDupes.StatusBar.setStatus(window, '');
      RemoveDupes.namedAlert(window, 'no_duplicates_found');
    } else {
      // if the user wanted silent removal, we'll be more quiet about telling
      // him/her there are no dupes
      RemoveDupes.StatusBar.setNamedStatus(window, 'no_duplicates_found');
    }
    searchData = null;
  } else {
    RemoveDupes.StatusBar.setNamedStatus(window, 'search_complete');
    RemoveDupes.MessengerOverlay.reviewAndRemoveDupes(searchData);
    // document.getElementById('progress-panel').setAttribute('collapsed', true);
  }
};

// stripAndSortAddresses -
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

RemoveDupes.MessengerOverlay.stripAndSortAddresses = function (headerString) {
  const gEmailRegExp = RegExp(
    // recall that ?: at the beginning of the parenthesized sections
    // means we're not interested in remembering the matching for these
    // sections specifically
    //
    // disallowed email address beginning with an apostrophe (') to
    // better handle single-quoted addresses such as
    // 'my.addr@somewhere.com'
    "(?:\\b|^)[a-z0-9!#$%&*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@" +
    "(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\b|$)", "gi");
  const gSingleQuotedEmailRegExp = RegExp(
    "(?:\\b|^)'[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@" +
    "(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'", "gi");
  const gEncodedWordRegExp = /=\\?.*\\?=/g;
  if ((headerString == null) || (headerString == "")) {
    return headerString;
  }
  // if we suspect there's un-decoded text, let's not do anything and
  // keep the field the way it is; at worst, we'll have some false-non-dupes
  if (gEncodedWordRegExp.test(headerString)) {
    return headerString;
  }
  let matches = headerString.match(gEmailRegExp);
  if (!matches) {
    // let's try looking for addresses within single quotes,
    // and clip the quotes
    matches = headerString.match(gSingleQuotedEmailRegExp);
    // again, if we can't get any addresses, let's stay with the
    // original header string rather than assume there are no addresses
    if (!matches) return headerString;
    for (let i = 0; i < matches.length; i++) {
      matches[i] = matches[i].substring(1, matches[i].length - 3);
    }
  }
  return matches.sort();
};

// sillyHash -
// Calculates the hash used for the first-phase separation of non-dupe
// messages; it relies on the non-expensive comparison criteria.
//
// Note: If a field is to be used in building the has, and is not a
// typically-optional field (like CC list), but is missing from
// the message - we either return null (in which case the message is to be
// ignored and not classified as a dupe of anything), or assume all elements
// with the missing field are the same w.r.t. this field.

RemoveDupes.MessengerOverlay.sillyHash = function (searchData, messageHdr, folder) {
  // Notes:
  // 1. There could theoretically be two messages which should not
  //    have the same hash, but do have it, if the subject includes the
  //    string '|6xX$\WG-C?|' or the author includes the string
  //    '|^#=)A?mUi5|' ; this is however highly unlikely... about as
  //    unlikely as collisions of a hash function, except that we haven't
  //    randomized; still, if a malicious user sent you e-mail with these
  //    strings in the author or subject fields, you probably don't care
  //    about deleting them anyway.
  // 2. We're not making full body comparisons/hashing here - only after
  //    creating dupe sets based on the 'cheap' criteria will we look at
  //    the message body

  let retVal = '';
  if (searchData.useCriteria.messageId) {
    let messageId = messageHdr.messageId;
    if (messageHdr.messageId.substring(0, 3) == 'md5:' && !searchData.allowMD5IDSubstitutes) {
      // Note: We are making a (generally invalid) assumption that actual message headers don't
      // begin with 'md5:'.
      if (searchData.assumeEachMissingValueIsUnique) {
        return null;
      }
      messageId = 'md5:(scrubbed)Ui*r8Ou@Eex=ae6O';
    }
    // some mail servers add newlines and spaces before or after message IDs
    retVal += `${messageId.replace(/(\n|^)\s+|\s+$/, "")}|`;
  }
  if (searchData.useCriteria.sendTime) {
    if (searchData.compareTimeNumerically) {
      retVal += `${messageHdr.dateInSeconds}|`;
    } else {
      let date = new Date(messageHdr.dateInSeconds * 1000);
      switch (searchData.timeComparisonResolution) {
      case "seconds": retVal += `${date.getSeconds()}|`; // fallthrough
      case "minutes": retVal += `${date.getMinutes()}|`; // fallthrough
      case "hours":   retVal += `${date.getHours()}|`; // fallthrough
      case "day":     retVal += `${date.getDate()}|`; // fallthrough
      case "month":   retVal += `${date.getMonth()}|`; // fallthrough
      case "year":    retVal += `${date.getFullYear()}`; break;
      default:
        // if someone uses an invalid comparison resolution,
        // they'll get a maximum-resolution comparison
        // to avoid false positives
        retVal += `${messageHdr.dateInSeconds}|'`;
      }
    }
  }
  if (searchData.useCriteria.size) {
    retVal += `${messageHdr.messageSize}|`;
  }
  if (searchData.useCriteria.folder) {
    retVal += `${folder.URI}|`;
  }
  if (searchData.useCriteria.subject) {
    if (messageHdr.subject == null && searchData.assumeEachMissingValueIsUnique) {
      return null;
    }
    retVal += `${messageHdr.subject}|6xX$WG-C?|`;
      // the extra 'junk string' is intended to reduce the chance of getting the subject
      // field being mixed up with other fields in the hash, i.e. in case the subject
      // ends with something like "|55"
  }
  if (searchData.useCriteria.author) {
    if (messageHdr.author == null && searchData.assumeEachMissingValueIsUnique) {
      return null;
    }
    let author = searchData.compareStrippedAndSortedAddresses ?
      RemoveDupes.MessengerOverlay.stripAndSortAddresses(messageHdr.mime2DecodedAuthor) : messageHdr.author;
    retVal += `${author}|^#=)A?mUi5|`;
  }
  if (searchData.useCriteria.recipients) {
    let recipients = searchData.compareStrippedAndSortedAddresses ?
      RemoveDupes.MessengerOverlay.stripAndSortAddresses(messageHdr.mime2DecodedRecipients) : messageHdr.recipients;
    retVal += `${recipients}|Ei4iXn=Iv*|`;
  }
  // note:
  // We're stripping here the non-MIME-transfer-encoding-decoded CC list!
  // It might not work, but we don't have immediate access to the decoded
  // version...
  if (searchData.useCriteria.ccList) {
    let ccList = searchData.compareStrippedAndSortedAddresses ?
      RemoveDupes.MessengerOverlay.stripAndSortAddresses(messageHdr.ccList) : messageHdr.ccList;
    retVal += `${ccList}|w7Exh' s%k|`;
  }
  if (searchData.useCriteria.lineCount) {
    retVal += `${messageHdr.lineCount}|`;
  }
  if (searchData.useCriteria.flags) {
    retVal += messageHdr.flags;
  }
  return retVal;
};

// The actual first phase of message processing (see
// processMessagesInCollectedFoldersPhase1 for more details)

RemoveDupes.MessengerOverlay.populateDupeSetsHash = function* (searchData) {
  // messageUriHashmap  will be filled with URIs for _all_ messages;
  // the dupe set hashmap will only have entries for dupes, and these
  // entries will be sets of dupes (technically, arrays of dupes)
  // rather than URIs
  let messageUriHashmap = { };

  // This next bit of code is super-ugly, because I need the `yield`ing to happen from
  // this function - can't yield from a function you're calling; isn't life great?
  // isn't lack of threading fun?
  //
  // Anyway, we want to have a function which takes an iterator into a collection of
  // folders, populating the hash with the messages in each folder - and run it twice,
  // first for the originals folder (allowing the creation of new dupe sets), then
  // for the search folders (allowing the creation of dupe sets if there are no originals,
  // and allowing the addition of dupes to existing sets

  let allowNewDupeSets = true;
  let doneWithOriginals;
  let foldersIterator;
  if (searchData.originalsFolders && searchData.originalsFolders.size != 0) {
    doneWithOriginals = false;
    foldersIterator = searchData.originalsFolders.values();
  } else {
    doneWithOriginals = true;
    foldersIterator = searchData.folders.values();
  }
  let maybeNext = foldersIterator.next();

  while (!maybeNext.done || !doneWithOriginals) {
    if (maybeNext.done) {
      // ... we continued looping since !doneWithOriginals . Now
      // let's move on to iterating the search folders.
      doneWithOriginals = true;
      if (searchData.folders.size == 0) {
        // this should really not happen...
        break;
      }
      foldersIterator = searchData.folders.values();
      allowNewDupeSets = Boolean(searchData.originalsFolders);
      maybeNext = foldersIterator.next();
    }
    let folder = maybeNext.value.QueryInterface(Ci.nsIMsgFolder);
    if (!folder) {
      break;
    }
    if (folder.isServer == true) {
      // shouldn't get here - these should have been filtered out already
      maybeNext = foldersIterator.next();
      continue;
    }

    let folderMessageHdrsIterator;
    try {
      folderMessageHdrsIterator = folder.messages;
    } catch (ex) {
      try {
        folderMessageHdrsIterator = folder.getMessages(msgWindow);
      } catch (ex2) {
        console.error(`Failed obtaining the messages iterator for folder ${folder.name}`);
        let formatted = RemoveDupes.Strings.format('failed_getting_messages', [folder.name]);
        console.error(`${formatted}\n`);
        dump(`${formatted}\n`);
      }
    }

    if (!folderMessageHdrsIterator) {
      console.error(`The messages iterator for folder ${folder.name} is null`);
      let formatted = `${RemoveDupes.Strings.format('failed_getting_messages', [folder.name])}\n`;
      console.error(formatted);
      dump(formatted);
      maybeNext = foldersIterator.next();
      continue;
    }

    while (folderMessageHdrsIterator.hasMoreElements() &&
           (!searchData.limitNumberOfMessages ||
               (searchData.messagesHashed < searchData.maxMessages))) {
      let messageHdr = folderMessageHdrsIterator.getNext().QueryInterface(Ci.nsIMsgDBHdr);

      if ((searchData.skipIMAPDeletedMessages) &&
          (messageHdr.flags & RemoveDupes.MessageStatusFlags.IMAP_DELETED)) {
        // TODO: Consider checking the time elapsed & possibly yielding, even when
        //  iterating IMAP-deleted messages
        continue;
      }

      let messageHash = this.sillyHash(searchData, messageHdr, folder);
      if (messageHash == null) {
        continue; // something about the message made us not be willing to compare it against other messages
      }
      let uri = folder.getUriForMsg(messageHdr);

      if (messageHash in messageUriHashmap) {
        if (messageHash in searchData.dupeSetsHashMap) {
          // just add the current message's URI, no need to copy anything
          searchData.dupeSetsHashMap[messageHash].push(uri);
        } else {
          // the URI in messageUriHashmap[messageHash] has not been copied to
          // the dupes hash since until now we did not know it was a dupe;
          // copy it together with our current message's URI
          // TODO: use [blah, blah] as the array constructor
          searchData.dupeSetsHashMap[messageHash] = [messageUriHashmap[messageHash], uri];
          searchData.totalOriginalDupeSets++;
        }
      } else if (allowNewDupeSets) {
        messageUriHashmap[messageHash] = uri;
      }

      searchData.messagesHashed++;
      let currentTime = (new Date()).getTime();
      if (currentTime - searchData.lastStatusBarReport > searchData.reportQuantum) {
        searchData.lastStatusBarReport = currentTime;
        RemoveDupes.StatusBar.setNamedStatus(window, 'hashed_x_messages', [searchData.messagesHashed]);
      }
      if (currentTime - searchData.lastYield > searchData.yieldQuantum) {
        searchData.lastYield = currentTime;
        yield undefined;
      }
    }
    maybeNext = foldersIterator.next();
  }
};

// messageBodyFromURI -
// An 'expensive' function used in the second phase of message
// processing, in which suspected sets of dupes are refined

RemoveDupes.MessengerOverlay.messageBodyFromURI = function (msgURI) {
//  The following lines don't work because of asynchronicity
//    let msgHdr = RemoveDupes.GetMsgFolderFromUri(msgURI);
//    let msgContent = await getRawMessage(msgHdr);
  let MsgService = MailServices.messageServiceFromURI(msgURI);
  if (!MsgService) {
    return null;
  }
  let MsgStream =  Cc["@mozilla.org/network/sync-stream-listener;1"].createInstance();
  let consumer = MsgStream.QueryInterface(Ci.nsIInputStream);
  let ScriptInput = Cc["@mozilla.org/scriptableinputstream;1"].createInstance();
  let ScriptInputStream = ScriptInput.QueryInterface(Ci.nsIScriptableInputStream);
  ScriptInputStream.init(consumer);
  try {
    MsgService.streamMessage(msgURI, MsgStream, msgWindow, null, false, null);
  } catch (ex) {
    return null;
  }
  ScriptInputStream.available();
  let msgContent = "";
  while (ScriptInputStream.available()) {
    msgContent += ScriptInputStream.read(512);
  }
  // the message headers end on the first empty line, and lines are delimited
  // by \n's or \r\n's ; of course, this logic is a rather lame hack, since if
  // the message has multiple MIME parts we're still getting the headers of all
  // the sub-parts, and not taking into any account the multipart delimiters.
  let endOfHeaders = /\r?\n\r?\n(.*)$/s;
  let matchResults = endOfHeaders.exec(msgContent);
  let msgBody = matchResults?.[1];
  return msgBody;
};

// Write some progress info to the status bar
RemoveDupes.MessengerOverlay.reportRefinementProgress = function (searchData, activity, messageIndex, numMessages) {
  let currentTime = (new Date()).getTime();
  if (currentTime - searchData.lastStatusBarReport < searchData.reportQuantum) {
    return;
  }
  searchData.lastStatusBarReport = currentTime;
  RemoveDupes.StatusBar.setNamedStatus(window, `refinement_status_${activity}`,
    // We add 1 to get 1-based indices
    [searchData.setsRefined + 1, searchData.totalOriginalDupeSets, messageIndex + 1, numMessages]);
  RemoveDupes.StatusBar.showProgress(window, (searchData.setsRefined + 1) / searchData.totalOriginalDupeSets);
};

// The actual second phase of message processing (see
// processMessagesInCollectedFoldersPhase2 for more details)

RemoveDupes.MessengerOverlay.refineDupeSets = function (searchData) {
  if (!searchData.useCriteria.body) return;

  // we'll split every dupe set into separate sets based on additional
  // comparison criteria (the more 'expensive' ones); size-1 dupe sets
  // are removed from the hash map entirely.

  // TODO: for now, our only 'expensive' criterion is the message body,
  // so I'm leaving the actual comparison code in this function and
  // not even checking for searchData.useBody; if and when we get additional
  // criteria this should be rewritten so that dupeSet[i] gets
  // a comparison record created for it, then for every j we call
  // `ourcomparefunc(comparisonrecord, dupeSet[j])`

  for (let hashValue in searchData.dupeSetsHashMap) {
    let dupeSet = searchData.dupeSetsHashMap[hashValue];

    // get the message bodies

    let initialSetSize = dupeSet.length;

    for (let i = 0; i < dupeSet.length; i++) {
      this.reportRefinementProgress(searchData, 'getting_bodies', i, initialSetSize);
      let dupeUri = dupeSet[i];
      dupeSet[i] = {
        uri: dupeUri,
        body: this.messageBodyFromURI(dupeUri)
      };
      if (searchData.userAborted) return;
    }

    // sort the bodies

    dupeSet.sort((lhs, rhs) => lhs - rhs);

    if (searchData.userAborted) return;

    // now build sub-dupesets from identical-body sequences of the sorted array

    let subsetIndex = 0;
    while (dupeSet.length > 0) {
      if (searchData.userAborted) {
        return;
      }
      if (!dupeSet[0].body) {
        dupeSet.shift();
        continue;
      }
      let subsetLength = 1;
      while ((subsetLength < dupeSet.length) &&
               (dupeSet[subsetLength].body == dupeSet[0].body)) {
        subsetLength++;
        dupeSet[subsetLength - 1] = dupeSet[subsetLength - 1].uri;
      }
      if (subsetLength > 1) {
        dupeSet[0] = dupeSet[0].uri;
        searchData.dupeSetsHashMap[`${hashValue}|${subsetIndex++}`] = dupeSet.splice(0, subsetLength);
      } else dupeSet.shift();
      RemoveDupes.MessengerOverlay.reportRefinementProgress(
        searchData, 'building_subsets', dupeSet.length - initialSetSize, dupeSet.length);
    }
    delete searchData.dupeSetsHashMap[hashValue];
    searchData.setsRefined++;
  }
};

// reviewAndRemoveDupes -
// This function either moves the dupes, erases them completely,
// or fires the review dialog for the user to decide what to do

RemoveDupes.MessengerOverlay.reviewAndRemoveDupes = function (searchData) {
  if (searchData.userAborted) {
    this.abortDupeSearch(searchData, 'search_aborted');
  }
  window.removeEventListener("keypress", searchData.keyPressEventListener, true);

  if (searchData.useReviewDialog) {
    let dialogURI = "chrome://removedupes/content/removedupes-dialog.xhtml";

    // open up a dialog in which the user sees all dupes we've found, and can decide which to delete
    window.openDialog(dialogURI, "removedupes", "chrome, resizable=yes",
      messenger, msgWindow, searchData.useCriteria,
      searchData.dupeSetsHashMap, searchData.originalsFolderUris,
      searchData.allowMD5IDSubstitutes);
  } else {
    // We'll keep one message from each set - by the arbitrary order in which we found them
    for (const messageHash in searchData.dupeSetsHashMap) {
      searchData.dupeSetsHashMap[messageHash].shift();
    }
    const DontHaveMessageRecords = false;
    let action = RemoveDupes.Prefs.get('default_action', null);
    if (action == 'delete_permanently') {
      RemoveDupes.Removal.deleteMessages(window, msgWindow, searchData.dupeSetsHashMap, DontHaveMessageRecords);
    } else {
      let targetFolderURI = RemoveDupes.Prefs.get('default_target_folder', null);
      let targetFolder = (targetFolderURI ? MailUtils.getExistingFolder(targetFolderURI) : null) ??
        RemoveDupes.Removal.getLocalFoldersTrashFolder();
      // TODO: Is this really a valid check? I wonder
      if (!targetFolder.parent && !targetFolder.isServer) {
        targetFolder = null;
      }

      if (!targetFolder) {
        // TODO: Should this not use RemoveDupes.alert?
        appWindow.alert(RemoveDupes.Strings.format('no_such_folder', [targetFolderURI]));
        throw Error(`No such folder ${targetFolderURI}`);
      }

      // without user confirmation or review; we're keeping the first dupe
      // in every sequence of dupes and deleting the rest
      RemoveDupes.Removal.moveMessages(
        window, msgWindow, searchData.dupeSetsHashMap,
        targetFolder, DontHaveMessageRecords);
    } // delete permanently?
  } // use the dialog?
  searchData = null;
};

RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion = function (ev, criterion) {
  // Note the criterion must be in snake_case, not camelCase
  let toggledValue = !RemoveDupes.Prefs.get(`comparison_criteria.${criterion}`,
    this.SearchCriterionUsageDefaults[criterion]);
  RemoveDupes.Prefs.set(`comparison_criteria.${criterion}`, toggledValue);
  document.getElementById(`removedupesCriterionMenuItem_${criterion}`)
    .setAttribute("checked", toggledValue ? "true" : "false");
  ev.stopPropagation();
};

RemoveDupes.MessengerOverlay.criteriaPopupMenuInit = function () {
  for (let criterion in this.SearchCriterionUsageDefaults) {
    document.getElementById(`removedupesCriterionMenuItem_${criterion}`)
      .setAttribute("checked",
        (RemoveDupes.Prefs.get(`comparison_criteria.${criterion}`,
          RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults[criterion]) ? "true" : "false"));
  }
};

// This function is only used if the gFolderTreeView object is available
// (for now, in TBird 3.x and later but not in Seamonkey 2.1.x and earlier);
// it replaces the callback for getting folder tree cell properties with
// a function which also adds the property of being a removedupes originals
// folder or not.

RemoveDupes.MessengerOverlay.replaceGetCellProperties = function () {
  if (typeof gFolderTreeView == 'undefined') return;
  gFolderTreeView.preRDGetCellProperties = gFolderTreeView.getCellProperties;
  gFolderTreeView.getCellProperties = function newGcp(aRow, aCol) {
    let properties = gFolderTreeView.preRDGetCellProperties(aRow, aCol);
    let row = gFolderTreeView._rowMap[aRow];
    if (this.originalsFolderUris?.has(row._folder.URI)) {
      properties += " isOriginalsFolder-true";
    }
    return properties;
  };
};

RemoveDupes.MessengerOverlay.setOriginalsFolders = function () {
  if (typeof gFolderTreeView == 'undefined') {
    let selectedMsgFolders = GetSelectedMsgFolders();
    this.originalsFolders = new Set();
    this.originalsFolderUris = new Set();
    for (let originalsFolder of selectedMsgFolders) {
      this.originalsFolders.add(originalsFolder);
      this.originalsFolderUris.add(originalsFolder.URI);
    }
    return;
  }

  // at this point we assume the gFolderTreeView object exists,
  // i.e. we can set custom properties for folders in the tree

  let selection = gFolderTreeView._treeElement.view.selection;
  let rangeCount = selection.getRangeCount();
  this.originalsFolders = new Set();
  this.originalsFolderUris = new Set();
  let skipSpecialFolders = RemoveDupes.Prefs.get('skip_special_folders', 'true');
  for (let i = 0; i < rangeCount; i++) {
    let startIndex = {};
    let endIndex = {};
    selection.getRangeAt(i, startIndex, endIndex);
    for (let j = startIndex.value; j <= endIndex.value; j++) {
      if (j >= gFolderTreeView._rowMap.length) break;

      let folder = gFolderTreeView._rowMap[j]._folder;
      if (skipSpecialFolders) {
        if (!folder.canFileMessages ||
            (folder.rootFolder == folder) ||
            (!folder.canRename &&
            (!(folder.flags & RemoveDupes.FolderFlags.Inbox)))) {
          RemoveDupes.namedAlert(window, 'invalid_originals_folders');
          continue;
        }
      }
      this.originalsFolders.add(folder);
      this.originalsFolderUris.add(folder.URI);
    }
  }
  gFolderTreeView._tree.invalidate();

  // TODO: Think of what happens if the user first marks the originals folders,
  // then changes the special folder skipping prefs; if we could clear the originals
  // in that case somehow...
};


//---------------------------------------------------
// a class definition of the listener which we'll
// need for recursively traversing IMAP folder hierarchies,
// in which each folder needs to be asynchronously updated
// with its on-server contents
//---------------------------------------------------
RemoveDupes.UpdateFolderDoneListener = function (folder, searchData) {
  this.folder = folder;
  this.searchData = searchData;
};

RemoveDupes.UpdateFolderDoneListener.prototype.QueryInterface = function (iid) {
  if (iid.equals(Ci.nsIUrlListener) ||
      iid.equals(Ci.nsISupports)) return this;
  throw Components.results.NS_ERROR_NO_INTERFACE;
};

RemoveDupes.UpdateFolderDoneListener.prototype.OnStartRunningUrl = function (url) { };
RemoveDupes.UpdateFolderDoneListener.prototype.OnStopRunningUrl = function (url, exitCode) {
  // TODO: Perhaps we should actually check the exist code...
  // for now we'll just assume the folder update weren't ok,
  // or we'll fail when trying to traverse the children
  RemoveDupes.MessengerOverlay.traverseSearchFolderSubfolders(this.folder, this.searchData);
};
//---------------------------------------------------


// a class for holding the search parameters (instead of
// using a bunch of globals)
//---------------------------------------------------
RemoveDupes.DupeSearchData = function () {
  this.searchSubfolders = RemoveDupes.Prefs.get("search_subfolders");

  let snakeToCamelCase = (str) => str.replace(/_[a-z]/g, (m) => m.slice(1).toUpperCase());
  this.useCriteria = { };
  // which information will we use for comparing messages?
  for (let snakeCaseCriterion in RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults) {
    let camelCaseCriterion = snakeToCamelCase(snakeCaseCriterion);
    this.useCriteria[camelCaseCriterion] = RemoveDupes.Prefs.get(`comparison_criteria.${snakeCaseCriterion}`,
      RemoveDupes.MessengerOverlay.SearchCriterionUsageDefaults[snakeCaseCriterion]);
  }

  // an optimization: if we're comparing bodies, there shouldn't be any harm
  // in comparing by number of lines first

  this.useCriteria.lineCount = this.useCriteria.lineCount || this.useCriteria.body;

  // when messages have no Message-ID header, Mozilla uses their MD5
  // digest value; however, the implementation is somewhat buggy and
  // two copies of the same message reportedly get different MD5s
  // sometimes; plus, it's not _really_ the message ID

  this.allowMD5IDSubstitutes = RemoveDupes.Prefs.get("allow_md5_id_substitute", false);

  // Sometimes, a criterion or field we're using as a comparison
  // criteria is missing. In these cases, we have the following options:
  //
  // 1. Be cautious, and assume the field does actually have some value,
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
    RemoveDupes.Prefs.get("assume_each_missing_value_is_unique", true);

  // When comparing fields with address (recipients and CC list),
  // do we compare the fields in the way and order they appear in
  // the field, or do we canonicalize the fields by taking the
  // addresses only and sorting them?

  this.compareStrippedAndSortedAddresses =
    RemoveDupes.Prefs.get("compare_stripped_and_sorted_addresses", false);

  this.timeComparisonResolution = RemoveDupes.Prefs.get("time_comparison_resolution", "seconds");
  this.compareTimeNumerically = (this.timeComparisonResolution == "seconds");

  // which of the special folders (inbox, sent, etc.) will we be willing
  // to search in for duplicates?

  this.skipSpecialFolders = RemoveDupes.Prefs.get("skip_special_folders", true);
  this.skipIMAPDeletedMessages = RemoveDupes.Prefs.get("skip_imap_deleted_messages", true);
  this.useReviewDialog = RemoveDupes.Prefs.get("use_dialog_before_removal", true);

  // we might have to trigger non-blocking IMAP folder updates;
  // each trigger will increase this, each folder update completing
  // will decrease this
  this.remainingFolders = 0;

  this.dupeSetsHashMap = { };
  this.folders = new Set();

  // these are used for reporting progress in the status bar
  this.messagesHashed = 0;
  this.setsRefined = 0;
  this.totalOriginalDupeSets = 0;

  // maximum number of messages to process
  this.limitNumberOfMessages = RemoveDupes.Prefs.get("limit_number_of_processed_messages", false);
  this.maxMessages = RemoveDupes.Prefs.get("processed_messages_limit", 10000);

  // timing is used to decide when to make the next status
  // bar progress report and for yielding for processing UI events
  // (values here are in milliseconds)
  this.yieldQuantum = RemoveDupes.Prefs.get("yield_quantum", 200);
  this.reportQuantum = RemoveDupes.Prefs.get("status_report_quantum", 1500);

  if (RemoveDupes.MessengerOverlay.originalsFolders) {
    this.originalsFolderUris = RemoveDupes.MessengerOverlay.originalsFolderUris;
    this.originalsFolders = RemoveDupes.MessengerOverlay.originalsFolders;
  } else {
    // Just to avoid some JS warnings later about using a non-existent member
    this.originalsFolderUris = null;
  }
};

//---------------------------------------------------

window.addEventListener("load", RemoveDupes.MessengerOverlay.replaceGetCellProperties, false);
// this is not useful unless the event fires after all folders have
// been created - which is not the case
