var { RemoveDupes  } = ChromeUtils.importESModule("chrome://removedupes/content/removedupes-common.sys.mjs");
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

// This is a Javascript Array of folders (not URIs).
RemoveDupes.MessengerOverlay.originalsFolders = null;

// searchAndRemoveDuplicateMessages -
// Called from the UI to trigger a new dupe search

RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages = function (event) {
  // document.getElementById('progress-panel').removeAttribute('collapsed');
  RemoveDupes.StatusBar.statusFeedback(window)?.startMeteors();
  RemoveDupes.StatusBar.setNamedStatus(window, 'searching_for_dupes');
  let searchData = new RemoveDupes.DupeSearchData();
  this.originalsFolders = null; // We've made use of the marking; and it only applies for one search
  this.clearOriginalsFoldersMarking();
  if (typeof gFolderTreeView != 'undefined' && gFolderTreeView) {
    // TODO: Do we really need this next command with newer versions of Thunderbird?
    gFolderTreeView._tree.invalidate();
  }
  searchData.keyPressEventListener = (ev) => { this.onKeyPress(ev, searchData); };
  window.addEventListener("keypress", searchData.keyPressEventListener, true);
  this.beginSearchForDuplicateMessages(searchData, event);
};

RemoveDupes.MessengerOverlay.onKeyPress = function (ev, searchData) {
  if ((ev.code == KeyEvent.DOM_VK_CANCEL ||
       ev.code == KeyEvent.DOM_VK_ESCAPE ||
       ev.code == KeyEvent.DOM_VK_BACK_SPACE) &&
      !ev.shiftKey && !ev.altKey && !ev.ctrlKey && !ev.metaKey) {
    searchData.userAborted = true;
  }
};

RemoveDupes.MessengerOverlay.isSkippedSpecialFolder = function (folder) {
  // Note: Some folders are special but not skipped: The root folder and the Inbox.
  return (!(folder.canRename)) &&
         (folder.rootFolder != folder) &&
         !(folder.flags & RemoveDupes.FolderFlags.Inbox);
};

RemoveDupes.MessengerOverlay.beginSearchForDuplicateMessages = function (searchData, event) {
  let topFolders = RemoveDupes.MessengerOverlay.getActiveOrSelectedFoldersAndElements(event).folders;
  if (!(topFolders?.length > 0)) {
    this.abortDupeSearch(searchData, 'no_folders_selected');
    return;
  }

  if (searchData.skipSpecialFolders && topFolders.find(this.isSkippedSpecialFolder)) {
    // With the topFolders - which the user explicitly selected/made active - we will be more
    // strict regarding the presence of special folders (rather than silently ignoring them);
    // but later, with descendent folders - we would be willing to silently skip special ones.
    //
    // TODO: Consider separating the error message between the case of _all_ top folders
    // being skipped-special and the case of some-skipped-and-some-not.
    this.abortDupeSearch(searchData, 'not_searching_special_folders');
  }

  topFolders.forEach((folder) => this.addSearchFolders(folder, searchData));

  // Note: There may be some overlap between the search folders and the folders
  // with originals. This may not be super-intuitive, but it is possible; and it
  // is the way in which the user can get dupe sets containing only messages from
  // the originals folders.

  if (searchData.folders.size == 0) {
    this.abortDupeSearch(searchData);
    RemoveDupes.namedAlert(window, 'no_valid_folders_to_search');
    return;
  }

  // At this point, one would expect searchData.folders to contain
  // all the folders and subfolders we're collecting messages from -
  // but, alas this cannot be... We have to wait for all the IMAP
  // folders and subfolders to become ready and then be processed;
  // so let's call a sleep-poll function

  this.waitForFolderCollection(searchData);
};

RemoveDupes.MessengerOverlay.abortDupeSearch = function (searchData, labelStringName) {
  window.removeEventListener("keypress", searchData.keyPressEventListener, true);
  searchData = null;
  RemoveDupes.StatusBar.statusFeedback(window)?.stopMeteors();
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
  if (searchData.skipSpecialFolders && this.isSkippedSpecialFolder(folder)) {
    return; // skipping this folder
    // Note: We assume that descendent folders of special folders, even if not explicitly marked special,
    // _do_ share the need to skip their antecedents
  }
  if (folder.flags & RemoveDupes.FolderFlags.Virtual) {
    return; // skipping this folder
    // Q: Why skip virtual folders?
    // A: Because they expose what are essentially copies, duplicates, of messages which exists elsewhere.
    //    While it's true that one could search for dupes in _just_ a search folder, the danger of this
    //    causing data loss is rather high, so we avoid it.
  }

  if (folder.URI.substring(0, 7) == 'news://') {
    return;
    // TODO: Should we really avoid searching News folders? I wonder
  }

  searchData.numFoldersRemainingToTraverse++; // ... because we'll traverse this folder

  if (folder.isServer) {
    this.traverseSearchFolderSubfolders(folder, searchData);
    return;
  }

  searchData.folders.add(folder);

  try {
    let listener = new RemoveDupes.UpdateFolderDoneListener(folder, searchData);
    MailServices.imap.liteSelectFolder(folder, listener, msgWindow);
    // no traversal of children - the listener will take care of that in due time
    return;
  } catch (ex) {
    searchData.numFoldersRemainingToTraverse--;
  }

  // Is this a locally-stored folder with its DB out-of-date?

  try {
    // TODO: Do we actually need this QI?
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
    searchData.numFoldersRemainingToTraverse--;
  }

  // We assume at this point the folder is locally-stored and its message db is up-to-date,
  // so we can traverse its subfolders without any more preparation

  this.traverseSearchFolderSubfolders(folder, searchData);
};

// traverseSearchFolderSubfolders -
// Completes the work of addSearchFolder by traversing a
// folder's children once it's 'ready'; it is called asynchronously
// for IMAP folders

RemoveDupes.MessengerOverlay.traverseSearchFolderSubfolders = function (folder, searchData) {
  RemoveDupes.StatusBar.setNamedStatus(window, 'searching_for_dupes');

  if (searchData.searchSubfolders && folder.hasSubFolders) {
    for (let subFolder of folder.subFolders) {
      this.addSearchFolders(subFolder, searchData);
    }
  }

  searchData.numFoldersRemainingToTraverse--;
};

// the folder collection for a dupe search happens asynchronously; this function
// waits for the folder collection to conclude (sleeping and calling itself
// again if it hasn't), before continuing to the collection of messages
// from the folders

RemoveDupes.MessengerOverlay.waitForFolderCollection = function (searchData) {
  RemoveDupes.StatusBar.setNamedStatus(window, 'searching_for_dupes');

  if (searchData.userAborted) {
    this.abortDupeSearch(searchData, 'search_aborted');
    return;
  }

  // ... but it might still be the case that we haven't finished
  // traversing folders and collecting their subfolders for the dupe
  // search, so we may have to wait some more

  if (searchData.numFoldersRemainingToTraverse > 0) {
    setTimeout(() => this.waitForFolderCollection(searchData), 100);
    return;
  }
  this.processMessagesInCollectedFoldersPhase1(searchData);
};

// processMessagesInCollectedFoldersPhase1 -
// Called after we've collected all the folders we need to process messages in. The
// processing of messages has two phases - first, all messages are hashed into a
// possible-dupe-sets hash, then the sets of messages with the same hash values are
// refined using more costly comparisons than the hashing itself. The processing can
// take a long time; to allow the UI to remain responsive and the user to be able to
// abort the dupe search, we perform the first phase using a generator and a separate
// function which occasionally yields.
//
// ... but there's a second compilation: The first phase must be performed first for
// originals folders (if those are defined), to collect the originals, and only then
// on the non-original search folders, which can only add to existing dupe sets. So,
// we apply the generator twice, with a flag in searchData indicating which set of
// folders it needs to apply to.
//
// TODO: We could probably refactor this code to use Javascript async and await and
// get rid of the generators and the timeouts.

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

RemoveDupes.MessengerOverlay.refineDupeSets = function (searchData) {
  // we'll split every dupe set into multiple sets based on additional comparison criteria
  // (the more 'expensive' ones); size-1 dupe sets will be discarded of course.

  // For now, our only 'expensive' criterion is the message body; if and when we get
  // additional criteria, this should be rewritten so that each message-representing object
  // gets keys for each of the expensive criteria in use, and those are reported for
  // the groupBy() operation.

  if (!searchData.useCriteria.body) return;

  for (let hashValue in searchData.dupeSets) {
    let unrefinedDupeSet = searchData.dupeSets[hashValue]; // and it's an array of URIs
    let unrefinedDupeSetWithBodies = unrefinedDupeSet.map((dupeUri, idxInSet) => {
      if (searchData.userAborted) return {};
      this.reportRefinementProgress(searchData, 'getting_bodies', idxInSet, unrefinedDupeSet.length);
      return {
        uri: dupeUri,
        body: this.messageBodyFromURI(dupeUri)
      };
    });
    if (searchData.userAborted) return;
    unrefinedDupeSetWithBodies.filter((uriAndBody) => (uriAndBody.body != null));
    // We won't consider messages, whose bodies we can't obtain, to be null - as a safety
    // precaution. But note that we _are_ willing to identify messages with empty-string
    // bodies as duplicates.

    let refinedDupeSets = Object
      .groupBy(unrefinedDupeSetWithBodies, (uriAndBody) => uriAndBody.body);
    // refinedDupeSets is now an object keyed by body, of arrays of { body, uri } - all sharing the same body
    refinedDupeSets = Object.values(refinedDupeSets)
      .filter((refinedDupeSet) => refinedDupeSet.length > 1)
      // if a "single dupe" remains - it is not a dupe of anything...
      .map((refinedDupeSet) => refinedDupeSet.map((uriAndBody) => uriAndBody.uri));

    if (searchData.userAborted) return;

    // TODO: We used to have this reporting code run inside a raw loop, and would report the
    // index within the unrefined dupe set at which we were positioned; but that's no
    // longer the case - while the .properties string has not yet changed. We should
    // probably make it something like 'dupe_set_refined'.
    this.reportRefinementProgress(searchData, 'building_subsets', unrefinedDupeSet.length, unrefinedDupeSet.length);

    let subsetIndex = 0;
    for (const refinedDupeSet of refinedDupeSets) {
      searchData.dupeSets[`${hashValue}|${subsetIndex++}`] = refinedDupeSet;
    }
    delete searchData.dupeSets[hashValue];
    searchData.setsRefined++;
  }
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
      setTimeout(RemoveDupes.MessengerOverlay.processMessagesInCollectedFoldersPhase2, 100, searchData);
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

  RemoveDupes.StatusBar.statusFeedback(window)?.stopMeteors();
  if (Object.keys(searchData.dupeSets).length === 0) {
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
      this.stripAndSortAddresses(messageHdr.mime2DecodedAuthor) : messageHdr.author;
    retVal += `${author}|^#=)A?mUi5|`;
  }
  if (searchData.useCriteria.recipients) {
    let recipients = searchData.compareStrippedAndSortedAddresses ?
      this.stripAndSortAddresses(messageHdr.mime2DecodedRecipients) : messageHdr.recipients;
    retVal += `${recipients}|Ei4iXn=Iv*|`;
  }
  // note:
  // We're stripping here the non-MIME-transfer-encoding-decoded CC list!
  // It might not work, but we don't have immediate access to the decoded
  // version...
  if (searchData.useCriteria.ccList) {
    let ccList = searchData.compareStrippedAndSortedAddresses ?
      this.stripAndSortAddresses(messageHdr.ccList) : messageHdr.ccList;
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
  let dupeSetsOfOriginals = { };

  // This function is rather ugly super-ugly, because it's a generator, and apparently we need the
  // `yield`ing to happen from within this function's body - can't yield from another function we're
  // calling. And that means it's difficult to factor some things out. Annoying!

  let getMessageWithFailureReporting = (folder) => {
    if (folder?.messages) { return folder.messages; }
    let formatted = `${RemoveDupes.Strings.format('failed_getting_messages', [folder.name])}\n`;
    console.error(formatted);
    dump(formatted);
    return false;
  };

  let possiblyReportProgress = (time) => {
    if (time - searchData.lastStatusBarReport > searchData.reportQuantum) {
      searchData.lastStatusBarReport = time;
      RemoveDupes.StatusBar.setNamedStatus(window, 'hashed_x_messages', [searchData.messagesHashed]);
    }
  };
  let messageLimitReached = () => searchData.limitNumberOfMessages && (searchData.messagesHashed >= searchData.maxMessages);
  let needToYield = (time) => time - searchData.lastYield > searchData.yieldQuantum;

  // This is the heart of the entire extension!
  let processSingleMessage = (messageHdr, folder, inOriginalsFolder, inSearchFolder) => {
    // Some local helper functions to avoid repetition
    const formNewDupeSet = (dupeSets, hash, secondDupeURI) => {
      dupeSets[hash] = [messageUriHashmap[hash], secondDupeURI];
    };
    const formDupeSetWithOriginalsDupeSet = (hash, lastDupeURI) => {
      searchData.dupeSets[hash] = [...dupeSetsOfOriginals[hash], lastDupeURI];
      searchData.dupeSets[hash].push(lastDupeURI);
    };

    // TODO: Consider checking the time & possibly yielding here
    if (searchData.skipIMAPDeletedMessages && (messageHdr.flags & RemoveDupes.MessageStatusFlags.IMAP_DELETED)) {
      return;
    }
    let messageHash = this.sillyHash(searchData, messageHdr, folder);
    if (!messageHash) {
      return;
    }
    let uri = folder.getUriForMsg(messageHdr);

    if (!(messageHash in messageUriHashmap)) {
      // Have not yet seen a message like this before
      if (inOriginalsFolder) {
        messageUriHashmap[messageHash] = uri;
      }
    } else {
      // have already seen messages like this before
      if (inSearchFolder) {
        if (messageHash in searchData.dupeSets) {
          searchData.dupeSets[messageHash].push(uri);
        } else if (messageHash in dupeSetsOfOriginals) {
          formDupeSetWithOriginalsDupeSet(messageHash, uri);
          searchData.totalOriginalDupeSets++;
        } else {
          formNewDupeSet(searchData.dupeSets, messageHash, uri);
          searchData.totalOriginalDupeSets++;
        }
      } else {
        // This is not a search folder, so it must be an originals folder
        if (messageHash in dupeSetsOfOriginals) {
          dupeSetsOfOriginals[messageHash].push(uri);
        } else {
          formNewDupeSet(dupeSetsOfOriginals, messageHash, uri);
          // Note we're not counting this one towards the dupe sets total - until it's 'adopted'
          // by a search folder dupe
        }
      }
    }
    searchData.messagesHashed++;
  }; // processSingleMessage

  let allFolders = (() => {
    if (!searchData.originalsFolders) { return searchData.folders; }
    let originalsSearch =  searchData.originalsFolders.intersection(searchData.folders);
    return [
      ...searchData.originalsFolders.difference(originalsSearch),
      ...originalsSearch,
      ...searchData.folders.difference(originalsSearch)
    ]; // This ordering ensures that no dupe sets are discarded due to the non-original being seen
       // before the original; nor because a second non-search original is seen after a search original
  })();
  for (const folder of allFolders) {
    let isOriginal = (!searchData?.originalsFolders) || searchData.originalsFolders.has(folder);
    let isSearch = searchData.folders.has(folder);
    for (const messageHdr of getMessageWithFailureReporting(folder)) {
      processSingleMessage(messageHdr, folder, isOriginal, isSearch);
      if (messageLimitReached()) { break; }
      let currentTime = (new Date()).getTime();
      possiblyReportProgress(currentTime);
      if (currentTime - searchData.lastYield > searchData.yieldQuantum) {
        searchData.lastYield = currentTime;
        yield undefined;
      }
    } // for messageHdr
    if (messageLimitReached()) { break; }
  } // for folder
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

// Group the objects in an array (of objects) using one of their
// properties, forming small arrays for each value of the property,
// and returning an object of arrays, keyed by the values of the
// property in the original objects.
//
// Example:
//   groupBy(
//     [
//       { color: 'red', foo: 2 },
//       { color: 'green' },
//       { color: 'red', foo: 1 }
//     ], 'color')
//
// will produce the object
//   {
//     'red':   [ { color: 'red', foo: 2 }, { color: 'red', foo: 1 } ]
//     'green': [ { color: 'green' } ]
//   }
//
// Adapted from: https://stackoverflow.com/a/34890276/1593077
// and: https://gist.github.com/robmathers/1830ce09695f759bf2c4df15c29dd22d
//
// `data` is an array of objects, `key` is the key (or property accessor) to group by
// reduce runs this anonymous function on each element of `data` (the `item` parameter,
// returning the `storage` parameter at the end
RemoveDupes.MessengerOverlay.groupArrayBy = function (arr, property) {
  return arr.reduce((storage, item) => {
    // get the first instance of the key by which we're grouping
    let groupKey = item[property];


    // set `storage` for this instance of group to the outer scope (if not empty) or initialize it
    storage[groupKey] = storage[groupKey] || [];

    // add this item to its group within `storage`
    storage[groupKey].push(item);

    // return the updated storage to the reduce function, which will then loop through the next
    return storage;
  }, {}); // {} is the initial value of the storage
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

    let originalFolderUris = searchData.originalsFolders ?
      new Set([...searchData.originalsFolders].map((folder) => folder.URI)) : null;
    // open up a dialog in which the user sees all dupes we've found, and can decide which to delete
    window.openDialog(dialogURI, "removedupes", "chrome, resizable=yes",
      messenger, msgWindow, searchData.useCriteria,
      searchData.dupeSets, searchData.originalsFolderUris,
      searchData.allowMD5IDSubstitutes);
  } else {
    // We'll keep one message from each set - by the arbitrary order in which we found them
    for (const messageHash in searchData.dupeSets) {
      searchData.dupeSets[messageHash].shift();
    }
    const DontHaveMessageRecords = false;
    let action = RemoveDupes.Prefs.get('default_action', null);
    if (action == 'delete_permanently') {
      RemoveDupes.Removal.deleteMessages(window, msgWindow, searchData.dupeSets, DontHaveMessageRecords);
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
        window, msgWindow, searchData.dupeSets,
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
          this.SearchCriterionUsageDefaults[criterion]) ? "true" : "false"));
  }
};

RemoveDupes.MessengerOverlay.getFolderTree = function () {
  const tabMail = document.getElementById('tabmail');
  if (tabMail?.currentTabInfo.mode.name != 'mail3PaneTab') { return null; }
  return tabMail.currentAbout3Pane?.folderTree;
};

// Returns an object with two keys: element and folder
RemoveDupes.MessengerOverlay.getActiveFolderAndTreeElement = function (event) {
  let result = {};
  const win = event?.target?.ownerGlobal;
  // ... but can't we use this code's "own" window instead?
  const folderPaneContextMenu = win?.folderPaneContextMenu;
  result.folder = folderPaneContextMenu?.activeFolder;
  // ...and note that there may be no active folder, i.e. it's quite
  // possibly for this function to return null
  if (!result.folder) { return result; }
  let folderTree = win?.document.getElementById("folderTree");
  if (!folderTree) { return result; }
  result.element = folderTree.querySelector(".context-menu-target");
  return result;
};

// Returns an object with two keys: elements and folders, with each value being a JS array
RemoveDupes.MessengerOverlay.getSelectedFoldersAndTreeElements = function () {
  let result = {};
  // Notes:
  // 1. The _selected_ folders don't change if you right-click a different folder; that
  //    one will just become the _active_ folder.
  // 2. When we get here via a context menu click for a folder tree folder,
  //    it's possible to get the folderTree via the event target; but - this doesn't
  //    work if we get here via the menubar.

  let selection = this.getFolderTree()?.selection;
  if (!selection) { return result; }
  result.elements = [...selection];
  result.folders = result.elements.map((row) => MailServices.folderLookup.getFolderForURL(row.uri));
  return result;
};

RemoveDupes.MessengerOverlay.getActiveOrSelectedFoldersAndElements = function (event) {
  // We need to apply a bit of a complex logic, because we may be triggered by
  // a context menu in the folder tree; and that tree may have some folders
  // selected while another folder is "active" - the one the user right-clicked
  // for the context menu.

  // TODO: Can we get the active folder without the event?
  const active = this.getActiveFolderAndTreeElement(event);
  const selected  = this.getSelectedFoldersAndTreeElements();
  if (active.folder && !selected?.folders?.includes(active.folder)) {
    return { folders: [active.folder], elements: [active.element] };
  }
  return selected;
};

RemoveDupes.MessengerOverlay.clearOriginalsFoldersMarking = function () {
  let folderTree = this.getFolderTree();
  let allElements = folderTree.querySelectorAll('li[is="folder-tree-row"]');
  // Note: These could be lots of folders. We could, in principle, limit ourselves to
  // just those folders we had previously marked as originals; but - let's err on the
  // side of caution for now.
  allElements.forEach((e) => e?.classList?.remove('originals-folder'));
};

RemoveDupes.MessengerOverlay.markOriginalsFolders = function (foldersAndTreeElements) {
  this.clearOriginalsFoldersMarking();
  for (let e of foldersAndTreeElements.elements) { e?.classList?.add('originals-folder'); }
};

// Note: The originalFolders this function sets is a JS Array (or null)
RemoveDupes.MessengerOverlay.setOriginalsFolders = function (event) {
  delete this.originalsFolders;

  let activeOrSelected = this.getActiveOrSelectedFoldersAndElements(event);
  if (!activeOrSelected?.folders || activeOrSelected.folders.length == 0) {
    return;
  }
  let skippingSpecialFolders = RemoveDupes.Prefs.get('skip_special_folders', 'true');
  if (skippingSpecialFolders && activeOrSelected.folders.find((folder) => this.isSkippedSpecialFolder(folder))) {
    RemoveDupes.namedAlert(window, 'not_searching_special_folders');
    // TODO: Use a distinct error message for reject special folders as originals folder
    return;
  }

  const folderIsInvalid = (folder) => !(folder.canFileMessages && (folder.rootFolder != folder));
  if (activeOrSelected.folders.find(folderIsInvalid)) {
    RemoveDupes.namedAlert(window, 'invalid_originals_folders');
    // TODO: Should we invalidate the selection?
    return;
  }
  RemoveDupes.MessengerOverlay.originalsFolders = activeOrSelected.folders;
  // TODO: Should we invalidate the selection here?

  RemoveDupes.MessengerOverlay.markOriginalsFolders(activeOrSelected);
  // Note: It is possible for the user to first marks the originals folders,
  // then changes the special folder skipping prefs; in that case, the special folders
  // from among the originals _will_ be searched for originals.
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


// A class for holding the parameters of a duplicate message search
//-----------------------------------------------------------------
//
// Note it is not initialized with any folders to search.
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
  this.numFoldersRemainingToTraverse = 0;

  this.dupeSets = { }; // The keys will be hash values, and the property values will be JS arrays
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
    this.originalsFolders = new Set(RemoveDupes.MessengerOverlay.originalsFolders);
    this.originalsFolderUris = new Set(RemoveDupes.MessengerOverlay.originalsFolders.map((folder) => folder.URI));
  } else {
    this.originalsFolders = null;
  }
};
