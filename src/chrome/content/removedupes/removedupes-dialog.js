
if ("undefined" == typeof(RemoveDupes)) {
var RemoveDupes = {};
};

var msgWindow; 
  // the 3-pane window which opened us
var messenger;
  // msgWindow's messenger
var dbView; 
  // the 3-pane window's message db view
var dupeSetsHashMap; 
  // the sets of duplicate messages we're reviewing for deletion
var originalsFolderUris;
  // the URIs of the folders containing the original
  // messages, if the search specified these
var allowMD5IDSubstitutes;
  // how do we treat MD5 hashes as substitutes for message IDs?
var useCriteria;
  // the comparison criteria used in the search

// used to refer to chrome elements
var dupeSetTree;
var messageRowTemplate;
var treeLineUriColumn;

// statistical info displayed on the status bar
var numberOfDupeSets;
var totalNumberOfDupes;
var numberToKeep;

#ifdef XBL_FOLDER_PICKER
var dupeMoveTargetFolder;
  // workaround for Mozilla bug 473009 - 
  // the new folder picker DOESN'T EXPOSE ITS F***ING selected folder!
  // ... and thank you very much David Ascher & TB devs for checking in
  // a folder picker without the most basic folder picker functionality,
  // forcing me to write a workaround
#endif

// indices of columns in dupe tree rows
// consts
 
const  toKeepColumnIndex      = 1;
const  authorColumnIndex      = 2;
const  recipientsColumnIndex  = 3;
const  ccListColumnIndex      = 4;
const  subjectColumnIndex     = 5;
const  folderNameColumnIndex  = 6;
const  sendTimeColumnIndex    = 7;
const  sizeColumnIndex        = 8;
const  lineCountColumnIndex   = 9;
const  messageIdColumnIndex   = 10;
const  flagsColumnIndex       = 11;

// state variables for dupe set sorting (see onClickColumn() )

DateService =
  Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
            .getService(Components.interfaces.nsIScriptableDateFormat);

var MessageStatusFlagValues = {
  READ:           0x0001,
  REPLIED:        0x0002,
  MARKED:         0x0004,
  EXPUNGED:       0x0008,
  HAS_RE:         0x0010,
  ELIDED:         0x0020,
  OFFLINE:        0x0080,
  WATCHED:        0x0100,
  SENDER_AUTHED:  0x0200,
  PARTIAL:        0x0400,
  QUEUED:         0x0800,
  FORWARDED:      0x1000,
  PRIORITIES:     0xE000
};

// DupeMessageRecord - a self-describing class;
// each dupe message in each dupe set will have a record built
DupeMessageRecord = function(messageUri) {
  var messageHdr  = messenger.msgHdrFromURI(messageUri);
  
  this.uri          = messageUri;
  this.folder_name  = messageHdr.folder.abbreviatedName;
  this.folderUri    = messageHdr.folder.URI;
  this.message_id   = 
   ((   allowMD5IDSubstitutes 
     || messageHdr.messageId.substr(0,4) != 'md5:') ?
    messageHdr.messageId : '');
  this.send_time    = messageHdr.dateInSeconds;
  this.size         = messageHdr.messageSize;
  this.subject      = messageHdr.mime2DecodedSubject;
  this.author       = messageHdr.mime2DecodedAuthor;
  this.recipients   = messageHdr.mime2DecodedRecipients;
  this.cc_list      = messageHdr.ccList;
  //this.flags      = "0x" + num2hex(messageHdr.flags);
  this.flags        = 
    flagsToString(messageHdr.flags);
  this.num_lines    = messageHdr.lineCount;
  // by default, we're deleting dupes, but see also below
  this.toKeep       = false; 
}

function flagsToString(flags) {
  var str = '';
  for(flagName in MessageStatusFlagValues) {
    if (flags & MessageStatusFlagValues[flagName])
      str += ' | ' + flagName;
  }
  return str.replace(' | ','');
}

function initDupeReviewDialog() {
#ifdef DEBUG_profile
  RemoveDupes.startTime = (new Date()).getTime();
#endif

  // TODO: If we're only using some of the fields for comparison,
  // our messageRecords currently have 'null' instead of actual values
  // so either we make the columns go away, or we show the non-compared
  // fields too by filling up the messageRecords...

  messenger              = window.arguments[0];
  msgWindow              = window.arguments[1];
  // XXX TO DO:
  // Do we need this argument?
  dbView                 = window.arguments[2];
  useCriteria            = window.arguments[3];
  dupeSetsHashMap        = window.arguments[4];
  originalsFolderUris    = window.arguments[5];
  allowMD5IDSubstitutes  = window.arguments[6];

  // let's replace the URI's with all the necessary information
  // for the display dialog:

  numberOfDupeSets = 0;
  totalNumberOfDupes = 0;

  // if no folders were pre-set as the 'originals', let's not
  // have the button mentioning them
  document.getElementById('keepPresetOriginalButton')
	  .setAttribute('hidden',(!originalsFolderUris));
  initializeFolderPicker();
  document.getElementById('action').value =
    RemoveDupes.Prefs.getCharPref('default_action', 'move');
  dupeSetTree = document.getElementById("dupeSetsTree");

  // indicate which columns were used in the search

  for(criterion in useCriteria) {
#ifdef DEBUG_initDupeReviewDialog
    RemoveDupes.JSConsoleService.logStringMessage(
      'criterion = ' + criterion);
#endif
  if (useCriteria[criterion] &&
      (criterion != 'body'))
      document.getElementById(criterion + 'Column')
              .setAttribute('comparisonCriterion',true);
  }

  // we re-form the dupe sets - instead of arrays of message URIs we
  // will now have arrays of DupeMessageRecord's, which contain much more
  // information (rather than having to repeatedly retrieve it)

  for (hashValue in dupeSetsHashMap) {
    numberOfDupeSets++;
    var dupeSet = dupeSetsHashMap[hashValue];
    for (var i=0; i < dupeSet.length; i++) {
      dupeSet[i] = new DupeMessageRecord(dupeSet[i]);
      if (originalsFolderUris) {
        // if we have pre-set originals folders, the default is to 
        // keep all of messages in them and remove their dupes elsewhere
        dupeSet[i].toKeep =
          (originalsFolderUris[dupeSet[i].folderUri] ? true : false);
      }
      totalNumberOfDupes++;
#ifdef DEBUG_initDupeReviewDialog
      RemoveDupes.JSConsoleService.logStringMessage(
        'dupe ' + i + ' for hash value ' + hashValue + ':\n' + dupeSet[i].uri);
#endif

    }
    if (!originalsFolderUris) {
      // if we don't have pre-set originals,
      // the default is to keep the first dupe in each set
      dupeSet[0].toKeep = true;
    }
  }
#ifdef DEBUG_profile
  RemoveDupes.endTime = (new Date()).getTime();
  RemoveDupes.JSConsoleService.logStringMessage(
    'dupe sets hash decoration time = ' +
    (RemoveDupes.endTime-RemoveDupes.startTime) + ' ms');
  RemoveDupes.startTime = (new Date()).getTime();
#endif

  initializeDuplicateSetsTree();
}

function initializeDuplicateSetsTree() {

#ifdef DEBUG_initializeDuplicateSetsTree
  RemoveDupes.JSConsoleService.logStringMessage('dupeSetTree = ' + dupeSetTree);
#endif
  dupeSetTree.currentItem = null;

  createMessageRowTemplate();
  var sortColumnId = dupeSetTree.getAttribute('sortColumn');
  if (sortColumnId)
    sortDupeSetsByField(document.getElementById(sortColumnId).getAttribute('fieldName'));

  for (hashValue in dupeSetsHashMap) {
    if (originalsFolderUris) {
      // by default, dupes in the pre-set originals folders are kept
      dupeSetsHashMap[hashValue][0].toKeep = true;
    }
  }

  rebuildDuplicateSetsTree();
#ifdef DEBUG_profile
  RemoveDupes.endTime = (new Date()).getTime();
  RemoveDupes.JSConsoleService.logStringMessage('initial rebuildDuplicateSetsTree time = ' + (RemoveDupes.endTime-RemoveDupes.startTime) + ' ms');
  RemoveDupes.startTime = (new Date()).getTime();
#endif
}

// createMessageRowTemplate -
// We create a message row for every message in every dupe set; to speed
// up this process we first create a template, with this function, then
// duplicate it and update it for each individual dupe set message

function createMessageRowTemplate() {
  // TODO: consider whether we want to disply/not display
  // certain fields based on whether they were in the comparison
  // criteria or not (or maybe display them in the top treerow
  // rather than in the unfolded rows)

  var dummyCell         = document.createElement("treecell");
   // the dummy column stores no information but shows the [+] box
   // for expansion and the lines to the expanded rows
  var keepIndicatorCell = document.createElement("treecell");
  keepIndicatorCell.setAttribute("id", "keepIndicatorCell");
  //keepIndicatorCell.setAttribute("src", "chrome://messenger/skin/icons/notchecked.gif");
  var authorCell        = document.createElement("treecell");
  authorCell.setAttribute("id", "authorCell");
  var recipientsCell    = document.createElement("treecell");
  recipientsCell.setAttribute("id", "recipientsCell");
  var ccListCell    = document.createElement("treecell");
  ccListCell.setAttribute("id", "ccListCell");
  var subjectCell       = document.createElement("treecell");
  subjectCell.setAttribute("id", "subjectCell");
  var folderCell        = document.createElement("treecell");
  folderCell.setAttribute("id", "folderCell");
  var sendTimeCell      = document.createElement("treecell");
  sendTimeCell.setAttribute("id", "sendTimeCell");
  var sizeCell      = document.createElement("treecell");
  sizeCell.setAttribute("id", "sizeCell");
  var lineCountCell     = document.createElement("treecell");
  lineCountCell.setAttribute("id", "lineCountCell");
  var messageIdCell     = document.createElement("treecell");
  messageIdCell.setAttribute("id", "messageIdCell");
  var flagsCell         = document.createElement("treecell");
  flagsCell.setAttribute("id", "messageIdCell");

  messageRowTemplate = document.createElement("treerow");
  messageRowTemplate.appendChild(dummyCell);
  messageRowTemplate.appendChild(keepIndicatorCell);
  messageRowTemplate.appendChild(authorCell);
  messageRowTemplate.appendChild(recipientsCell);
  messageRowTemplate.appendChild(ccListCell);
  messageRowTemplate.appendChild(subjectCell);
  messageRowTemplate.appendChild(folderCell);
  messageRowTemplate.appendChild(sendTimeCell);
  messageRowTemplate.appendChild(sizeCell);
  messageRowTemplate.appendChild(lineCountCell);
  messageRowTemplate.appendChild(messageIdCell);
  messageRowTemplate.appendChild(flagsCell);
  messageRowTemplate.setAttribute('indexInDupeSet', 0);
}

function clearStatusBar() {
  document.getElementById("total-status-panel").setAttribute("label", "");
  document.getElementById("sets-status-panel").setAttribute("label", "");
  document.getElementById("keeping-status-panel").setAttribute("label", "");
  document.getElementById("main-status-panel").setAttribute("label","");
}

function rebuildDuplicateSetsTree() {
#ifdef DEBUG_rebuildDuplicateSetsTree
      RemoveDupes.JSConsoleService.logStringMessage('in rebuildDuplicateSetsTree');
#endif

  clearStatusBar();

  var dupeSetTreeChildren = document.getElementById("dupeSetsTreeChildren");
#ifdef DEBUG_initializeDuplicateSetsTree
  RemoveDupes.JSConsoleService.logStringMessage('dupeSetTreeChildren = ' + dupeSetTreeChildren);
#endif
  if (dupeSetTreeChildren) {
    dupeSetTree.removeChild(dupeSetTreeChildren);
  }

  dupeSetTreeChildren = document.createElement("treechildren");

  document.getElementById("main-status-panel").setAttribute("label",
    RemoveDupes.Strings.GetStringFromName("removedupes.status_panel.populating_list"));

  numberToKeep = 0;

  for (hashValue in dupeSetsHashMap) {

    var dupeSet = dupeSetsHashMap[hashValue];

    // Every XUL tree has a single treechildren element. The treechildren
    // for the global tree of the 'removedupes' dialog has a treeitem for every
    // dupe set. Now things get a bit complicated, as for each dupe set we
    // have an internal tree (so that we can collapse/expand the elements of a
    // dupe set):
    //
    //  tree
    //   \---treechildren (outer)
    //         +--treeitem (for 1st dupe set; not expanded here)
    //         +--...
    //         +--treeitem (for Nth dupe set)
    //         |     \---treechildren (inner)
    //         |            +---treeitem (for 1st message in 2nd set; not expanded here)
    //         |            +---...
    //         |            +---treeitem (for Mth message in Nth set)
    //         |            |      \---treerow (for Mth message in Nth set)
    //         |            |             +---treecell (some bit of info about Mth message in Nth set)
    //         |            |             \---treecell (other bit of info about Mth message in Nth set)
    //         |            \---treeitem (for M+1'th message in Nth set; not expanded here)
    //         \--treeitem (for N+1'th dupe set; not expanded here)

    var dupeSetTreeChildrenInner  = document.createElement("treechildren");

    for (var i=0; i < dupeSet.length; i++) {
      if (dupeSet[i].toKeep) numberToKeep++;
      var dupeInSetRow = createMessageTreeRow(dupeSet[i]);
      var dupeInSetTreeItem = document.createElement("treeitem");
      dupeInSetTreeItem.setAttribute('indexInDupeSet', i);
      // TODO: does anyone know a simple way of getting the index of a treeitem within
      // its parent's childNodes?
      dupeInSetTreeItem.appendChild(dupeInSetRow);
      dupeSetTreeChildrenInner.appendChild(dupeInSetTreeItem);
    }

    var dupeSetTreeItem  = document.createElement("treeitem");
    dupeSetTreeItem.setAttribute('commonHashValue',hashValue);
    dupeSetTreeItem.appendChild(dupeSetTreeChildrenInner);
    dupeSetTreeItem.setAttribute("container", true);
    dupeSetTreeItem.setAttribute("open", true);

    dupeSetTreeChildren.appendChild(dupeSetTreeItem);
  }
  // only with this statement does any of the tree contents become visible
  dupeSetTree.appendChild(dupeSetTreeChildren);
  updateStatusBar();
}

function resetCheckboxValues() {
#ifdef DEBUG_resetCheckboxValues
      RemoveDupes.JSConsoleService.logStringMessage('in resetCheckboxValues');
#endif

  clearStatusBar();

  document.getElementById("main-status-panel").setAttribute("label",
    RemoveDupes.Strings.GetStringFromName("removedupes.status_panel.updating_list"));

  numberToKeep = 0;

  // to understand how this code works, see the comment regarding the tree
  // structure in the code of rebuildDuplicateSetsTree()

  var dupeSetTreeItem  =  dupeSetTreeChildren.firstChild;
  while (dupeSetTreeItem) {
    var hashValue = dupeSetTreeItem.getAttribute('commonHashValue');
    var dupeSet = dupeSetsHashMap[hashValue];
    var dupeInSetTreeItem = dupeSetTreeItem.firstChild.firstChild;
    while (dupeInSetTreeItem) {
      var indexInDupeSet = parseInt(dupeInSetTreeItem.getAttribute('indexInDupeSet'));

      dupeInSetTreeItem.firstChild.childNodes.item(toKeepColumnIndex).setAttribute(
        "properties", (dupeSet[indexInDupeSet].toKeep ? "keep" : "delete"));

      if (dupeSet[indexInDupeSet].toKeep) numberToKeep++;
      dupeInSetTreeItem = dupeInSetTreeItem.nextSibling;
    }
    dupeSetTreeItem = dupeSetTreeItem.nextSibling;
  }
  updateStatusBar();
}

function updateStatusBar() {
  document.getElementById("sets-status-panel").setAttribute("label",
    RemoveDupes.Strings.GetStringFromName("removedupes.status_panel.number_of_sets") + " " + numberOfDupeSets);
  document.getElementById("total-status-panel").setAttribute("label", 
    RemoveDupes.Strings.GetStringFromName("removedupes.status_panel.total_number_of_dupes") + " " + totalNumberOfDupes);
  document.getElementById("keeping-status-panel").setAttribute("label", 
    RemoveDupes.Strings.GetStringFromName("removedupes.status_panel.number_of_kept_dupes") + " " + numberToKeep);
  document.getElementById("main-status-panel").setAttribute("label", "");
}

// createMessageTreeRow -
// To create the dupe set tree row for a specific message,
// we duplicate the row template and modify it with data
// from the messageRecord

function createMessageTreeRow(messageRecord) {
#ifdef DEBUG_createMessageTreeRow
  RemoveDupes.JSConsoleService.logStringMessage('makeNewRow');
#endif

  var row = messageRowTemplate.cloneNode(true);
    // a shallow clone is enough here

  // recall we set the child nodes order in createMessageRowTemplate()

  // first there's the dummy cell we don't touch  
  // this next line allows us to use the css to choose whether to 
  // use a [ ] image or a [v] image
  row.childNodes.item(toKeepColumnIndex)
     .setAttribute("properties", (messageRecord.toKeep ? "keep" : "delete") );
  // the author and subject should be decoded from the
  // proper charset and transfer encoding
  row.childNodes.item(authorColumnIndex)
     .setAttribute("label", messageRecord.author); 
  row.childNodes.item(recipientsColumnIndex)
     .setAttribute("label", messageRecord.recipients); 
  row.childNodes.item(ccListColumnIndex)
     .setAttribute("label", messageRecord.cc_list); 
  row.childNodes.item(subjectColumnIndex)
     .setAttribute("label", messageRecord.subject);
  row.childNodes.item(folderNameColumnIndex)
     .setAttribute("label", messageRecord.folder_name);
  row.childNodes.item(sendTimeColumnIndex)
     .setAttribute("label", formatSendTime(messageRecord.send_time));
  row.childNodes.item(sizeColumnIndex)
     .setAttribute("label", messageRecord.size);
  row.childNodes.item(lineCountColumnIndex)
     .setAttribute("label", messageRecord.num_lines);
  row.childNodes.item(messageIdColumnIndex)
     .setAttribute("label", messageRecord.message_id);
  row.childNodes.item(flagsColumnIndex)
     .setAttribute("label", messageRecord.flags);
#ifdef DEBUG_createMessageTreeRow
  RemoveDupes.JSConsoleService.logStringMessage('messageRecord.lineCount = ' + messageRecord.lineCount);
#endif

  return row;
}

// formatSendTime -
// Create a user-legible string for our seconds-since-epoch time value

function formatSendTime(sendTimeInSeconds) {
  var date = new Date( sendTimeInSeconds*1000 );
    // the Date() constructor expects miliseconds

#ifdef DEBUG_formatSendTime
  RemoveDupes.JSConsoleService.logStringMessage('sendTimeInSeconds = ' + sendTimeInSeconds);
  RemoveDupes.JSConsoleService.logStringMessage('date = ' + date);
  RemoveDupes.JSConsoleService.logStringMessage('date.getFullYear() = ' + date.getFullYear());
  RemoveDupes.JSConsoleService.logStringMessage('date.getMonth()+1 = ' + date.getMonth()+1);
  RemoveDupes.JSConsoleService.logStringMessage('date.getDate() = ' + date.getDate());
  RemoveDupes.JSConsoleService.logStringMessage('date.getHours() = ' + date.getHours());
  RemoveDupes.JSConsoleService.logStringMessage('date.getMinutes() = ' + date.getMinutes());
#endif
  return DateService.FormatDateTime(
    "", // use application locale
    DateService.dateFormatShort,
    DateService.timeFormatSeconds, 
    date.getFullYear(),
    date.getMonth()+1, 
    date.getDate(),
    date.getHours(),
    date.getMinutes(), 
    date.getSeconds() );
}

// onTreeKeyPress -
// Toggle the keep status for Space Bar

function onTreeKeyPress(ev) {
#ifdef DEBUG_onTreeKeyPress
  RemoveDupes.JSConsoleService.logStringMessage('onTreeKeyPress, keycode is ' + ev.keyCode);
#endif
  if (ev.keyCode == KeyEvent.DOM_VK_SPACE) {
    toggleDeletionForCurrentRow();
  }
}

// onClickTree -
// Either toggle the deleted status of the message, load it for display,
// or do nothing

function onClickTree(ev) {
#ifdef DEBUG_onClickTree
  RemoveDupes.JSConsoleService.logStringMessage('in onClickTree()\nclick point = ' + ev.clientX + ':' + ev.clientY);
#endif

  var treeBoxOject = dupeSetTree.treeBoxObject;
  var row = {}, col = {}, obj = {};
  treeBoxOject.getCellAt(ev.clientX, ev.clientY, row, col, obj);

//  var x = {}, y = {}, w = {}, h = {};
//  treeBoxOject.getCoordsForCellItem(row.value, col.value, "treecell", x, y, w, h);

  if (   !col.value
      || !row.value 
      || !col.value.index 
      || !dupeSetTree.contentView
                     .getItemAtIndex(dupeSetTree
                                                .currentIndex).hasAttribute('indexInDupeSet') ) {
    // this isn't a valid cell we can use, or it's in one of the [+]/[-] rows
#ifdef DEBUG_onClickTree
    RemoveDupes.JSConsoleService.logStringMessage('not a valid cell, doing nothing');
#endif
    return;
  }

  if (col.value.index == toKeepColumnIndex) {
    toggleDeletionForCurrentRow();
    return;
  }

  loadCurrentRowMessage();
}

// loadCurrentRowMessage -
// When the user selects a message row, we load that message in the 3-pane window

function loadCurrentRowMessage() {
#ifdef DEBUG_loadCurrentRowMessage
  RemoveDupes.JSConsoleService.logStringMessage('in loadCurrentRowMessage()\ngTree.currentIndex = ' + dupeSetTree.currentIndex);
#endif
  // when we click somewhere in the tree, the focused element should be an inner 'treeitem'
  var focusedTreeItem = dupeSetTree.contentView.getItemAtIndex(dupeSetTree.currentIndex);
  var messageIndexInDupeSet = focusedTreeItem.getAttribute('indexInDupeSet');
  var dupeSetTreeItem = focusedTreeItem.parentNode.parentNode;
#ifdef DEBUG_loadCurrentRowMessage
  var node = dupeSetTreeItem;
  RemoveDupes.JSConsoleService.logStringMessage('dupeSetTreeItem: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
  var node = dupeSetTreeItem.parentNode;
  RemoveDupes.JSConsoleService.logStringMessage('dupeSetTreeItem.parentNode: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
  var node = dupeSetTreeItem.parentNode.parentNode;
  RemoveDupes.JSConsoleService.logStringMessage('dupeSetTreeItem.parentNode.parentNode: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif
  var dupeSetHashValue = dupeSetTreeItem.getAttribute('commonHashValue');
#ifdef DEBUG_loadCurrentRowMessage
  RemoveDupes.JSConsoleService.logStringMessage('dupeSetHashValue = ' + dupeSetHashValue);
#endif
  var dupeSetItem = dupeSetsHashMap[dupeSetHashValue][messageIndexInDupeSet];
  var messageUri = dupeSetItem.uri;
  var folder = messenger.msgHdrFromURI(messageUri).folder;
  //msgFolder = folder.QueryInterface(Components.interfaces.nsIMsgFolder);
  //msgWindow.RerootFolderForStandAlone(folder.uri);
  //msgWindow.RerootFolder(folder.uri, msgFolder, gCurrentLoadingFolderViewType, gCurrentLoadingFolderViewFlags, gCurrentLoadingFolderSortType, gCurrentLoadingFolderSortOrder);

  msgWindow = msgWindow.QueryInterface(Components.interfaces.nsIMsgWindow);
  if (msgWindow.SelectFolder) {
    // it's an old-skool msgWindow, i.e. before the 2007-05-21 check-in
    // which changed the API
    msgWindow.SelectFolder(folder.URI);
    msgWindow.SelectMessage(messageUri);
  }
  else {
    msgWindow.windowCommands.selectFolder(folder.URI);
    msgWindow.windowCommands.selectMessage(messageUri);
  }
}

function toggleDeletionForCurrentRow() {
#ifdef DEBUG_toggleDeletionForCurrentRow
  RemoveDupes.JSConsoleService.logStringMessage('in toggleDeletionForCurrentRow()\ngTree.currentIndex = ' + dupeSetTree.currentIndex);
#endif
  var focusedTreeItem = dupeSetTree.contentView.getItemAtIndex(dupeSetTree.currentIndex);

  // The user has clicked a message row, so change it status
  // from 'Keep' to 'Delete' or vice-versa

  var messageIndexInDupeSet = focusedTreeItem.getAttribute('indexInDupeSet');
  var dupeSetTreeItem = focusedTreeItem.parentNode.parentNode;
  var dupeSetHashValue = dupeSetTreeItem.getAttribute('commonHashValue');
  var dupeSetItem = dupeSetsHashMap[dupeSetHashValue][messageIndexInDupeSet];

  if (dupeSetItem.toKeep) {
    dupeSetItem.toKeep = false;
    numberToKeep--;  
  }
  else {
    dupeSetItem.toKeep = true;
    numberToKeep++;  
  }
  focusedRow = focusedTreeItem.firstChild;
  focusedRow.childNodes.item(toKeepColumnIndex).setAttribute(
    "properties", (dupeSetItem.toKeep ? "keep" : "delete"));

  updateStatusBar();
}

function onCancel() {
  delete dupeSetsHashMap;
}

function onAccept() {
  var uri = null;
  try {
#ifdef XBL_FOLDER_PICKER
    var uri = dupeMoveTargetFolder.URI;
#else
    var uri = document.getElementById('actionTargetFolder').getAttribute('uri');
#endif
  } catch(ex) { }

#ifdef DEBUG_onAccept
  RemoveDupes.JSConsoleService.logStringMessage('uri is ' + uri);
#endif

  var deletePermanently =
    (document.getElementById('action').getAttribute('value') == 'delete_permanently');
  RemoveDupes.Removal.removeDuplicates(
    dupeSetsHashMap,
    deletePermanently,
    uri,
    true // the uri's have been replaced with messageRecords
    );
  if (!deletePermanently && (uri != null) && (uri != "")) {
    try {
      RemoveDupes.Prefs.setCharPref('default_target_folder', uri);
    } catch(ex) { }
  }
  delete dupeSetsHashMap;
}

function markAllDupesForDeletion() {
  for (hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (var i=0; i<dupeSet.length; i++ )
      dupeSet[i].toKeep = false;
  }
  resetCheckboxValues();
}

function markKeepOneInEveryDupeSet(keepFirst) {
  // we'll mark either the first of every dupe set for keeping,
  // or the last of every set, and mark the rest for deletion

  for (hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (var i=0; i<dupeSet.length; i++ ) {
      dupeSet[i].toKeep = false;
      if (keepFirst) {
        dupeSet[0].toKeep = true;
      }
      else {
        dupeSet[dupeSet.length-1].toKeep = true;
      }
    }
  }

  resetCheckboxValues();
}

function markKeepPresetOriginals() {
  for (hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (var i=0; i < dupeSet.length; i++ ) {
      dupeSet[i].toKeep =
        (originalsFolderUris[dupeSet[i].folderUri] ? true : false);
    }
  }
  resetCheckboxValues();
}


function markNoDupesForDeletion() {
  for (hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (var i=0; i<dupeSet.length; i++ )
      dupeSet[i].toKeep = true;
  }

  resetCheckboxValues();
}

function initializeFolderPicker() {
  var uri, msgFolder;
  // We might not have a pref for the default folder,
  // or the folder URIs may have changed for some reason
  try {
    uri = RemoveDupes.Prefs.getCharPref('default_target_folder', null);
    msgFolder = GetMsgFolderFromUri(uri, false);
  } catch(ex) { }

  if (!msgFolder) {
    uri = RemoveDupes.Removal.getLocalFoldersTrashFolder().URI;
    msgFolder = GetMsgFolderFromUri(uri, false);
  }

#ifdef DEBUG_initializeFolderPicker
  RemoveDupes.JSConsoleService.logStringMessage('setting folder picker to uri:\n' + uri);
#endif

#ifdef XBL_FOLDER_PICKER
  try {
    document.getElementById('actionTargetFolderPopup').selectFolder(msgFolder);
  } catch(ex) { }
#else
  // TODO: perhaps we don't need this when also calling SetFolderPicker ?
  MsgFolderPickerOnLoad('actionTargetFolder');
  SetFolderPicker(uri, 'actionTargetFolder');
#endif
  dupeMoveTargetFolder = msgFolder;
}

// onClickColumn -
// Changes the sort order to be based on this column, or if this is already
// the case - toggles the sort direction - low to high values in this
// column or vice versa

function onClickColumn(ev) {
#ifdef DEBUG_onClickColumn
  RemoveDupes.JSConsoleService.logStringMessage('in onClickColumn()');
#endif
  ev.stopPropagation();

  var field = ev.target.getAttribute('fieldName');

#ifdef DEBUG_onClickColumn
  RemoveDupes.JSConsoleService.logStringMessage('field = ' + field + '\ngTree.getAttribute(\'sortColumn\') = ' + dupeSetTree.getAttribute('sortColumn') );
#endif

  if (!field)
    return;

  if (dupeSetTree.getAttribute('sortColumn') == ev.target.id) {
#ifdef DEBUG_onClickColumn
    RemoveDupes.JSConsoleService.logStringMessage('reclick ; dupeSetTree.getAttribute(\'sortDirection\') = ' + dupeSetTree.getAttribute('sortDirection'));
#endif
    // re-clicking the current sort indicator means flipping the sort order
    dupeSetTree.setAttribute('sortDirection',
      (dupeSetTree.getAttribute('sortDirection') == 'ascending') ? 'descending' : 'ascending')
  }
  else {
    if (dupeSetTree.getAttribute('sortColumn')) {
#ifdef DEBUG_onClickColumn
      RemoveDupes.JSConsoleService.logStringMessage('clearing old sort column');
#endif
      document.getElementById(dupeSetTree.getAttribute('sortColumn')).removeAttribute('class');
      document.getElementById(dupeSetTree.getAttribute('sortColumn')).removeAttribute('sortDirection');
    }
    dupeSetTree.setAttribute('sortColumn', ev.target.id);
#ifdef DEBUG_onClickColumn
    RemoveDupes.JSConsoleService.logStringMessage('set dupeSetTree.getAttribute(\'sortColumn\') to' + dupeSetTree.getAttribute('sortColumn'));
#endif
    dupeSetTree.setAttribute('sortDirection', 'ascending');
  }

  sortDupeSetsByField(field);

#ifdef DEBUG_onClickColumn
  RemoveDupes.JSConsoleService.logStringMessage('setting attrs on new sort column' + ev.target + "\nto class and " + dupeSetTree.getAttribute('sortDirection'));
#endif
  ev.target.setAttribute('class','sortDirectionIndicator');
  ev.target.setAttribute('sortDirection',dupeSetTree.getAttribute('sortDirection'));
  rebuildDuplicateSetsTree();
}

// sortDupeSetsByField -
// re-sorts the messages to respect the order column selection

function sortDupeSetsByField(field) {
  // we will now re-sort every dupe set using the field whose
  // column the user has clicked

  var compareFunction = function(lhs, rhs) {
    if (lhs[field] == rhs[field])
      return 0;
    if (dupeSetTree.getAttribute('sortDirection') == 'descending')
      return ( (lhs[field] > rhs[field]) ? -1 : 1);
    else
      return ( (lhs[field] > rhs[field]) ? 1 : -1);
  };

  // TODO: see if you can't use the XUL tree's internal sorting mechanism; if we do that, we'll be able to
  // spare lots of tree-rebuilding

  for (hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    dupeSet.sort(compareFunction);
  }
}

#ifdef XBL_FOLDER_PICKER
function onTargetFolderClick(targetFolder) {
  dupeMoveTargetFolder = targetFolder;
#ifdef DEBUG_onTargetFolderClick
  RemoveDupes.JSConsoleService.logStringMessage('in onTargetFolderClick()\ntarget = ' + targetFolder.abbreviatedName);
#endif
  document.getElementById('actionTargetFolderPopup').selectFolder(targetFolder);
}
#endif

