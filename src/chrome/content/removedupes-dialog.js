const Ci = Components.interfaces;

const Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
const RemoveDupes = ChromeUtils.import("chrome://removedupes/content/removedupes-common.js").RemoveDupes;

var msgWindow;
  // the 3-pane window which opened us
var messenger;
  // msgWindow's messenger
var dbView;
  // the 3-pane window's message db view
var dupeSetsHashMap;
  // the sets of duplicate messages we're reviewing for deletion
var originalsFolderUris;
  // A set of the URIs of the folders containing the original
  // messages, if the search specified these
var allowMD5IDSubstitutes;
  // how do we treat MD5 hashes as substitutes for message IDs?
var useCriteria;
  // the comparison criteria used in the search
var commonRootFolder;
  // Root folder of the account in which all duplicate message are located... if one exists.

// used to refer to chrome elements
var dupeSetTree;
var messageRowTemplate;
var treeLineUriColumn;

// statistical info displayed on the status bar
var numberOfDupeSets;
var totalNumberOfDupes;
var numberToKeep;

// used to detect tree selection changes, as onselect doesn't work for some reason
var selectedRow = -1;


var dupeMoveTargetFolder;
  // workaround for Mozilla bug 473009 -
  // the new folder picker DOESN'T EXPOSE ITS F***ING selected folder!
  // ... and thank you very much David Ascher & TB devs for checking in
  // a folder picker without the most basic folder picker functionality,
  // forcing me to write a workaround

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


var formattingOptions = {
  year: 'numeric', month:  'numeric', day:    'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
  timeZoneName: 'short'
};
var DateTimeFormatter = new Services.intl.DateTimeFormat(undefined, formattingOptions);

// DupeMessageRecord - a self-describing class;
// each dupe message in each dupe set will have a record built
var DupeMessageRecord = function(messageUri) {
  var messageHdr  = messenger.msgHdrFromURI(messageUri);

  this.uri          = messageUri;
  this.folder_name  = messageHdr.folder.abbreviatedName;
  this.folderUri    = messageHdr.folder.URI;
  this.rootFolder   = messageHdr.folder.server.rootFolder;
    // the root folder is used for checking whether all messages are from the same account
  this.message_id   =
   ((   allowMD5IDSubstitutes
     || messageHdr.messageId.substr(0,4) != 'md5:') ?
    messageHdr.messageId : '');
  this.send_time    = messageHdr.dateInSeconds;
  this.size         = messageHdr.messageSize;
  try {
    this.subject    = messageHdr.mime2DecodedSubject;
  } catch(ex) {
    this.subject    = '(decoding failure)';
  }
  try {
    this.author     = messageHdr.mime2DecodedAuthor;
  } catch(ex) {
    this.author     = '(decoding failure)';
  }
  try {
    this.recipients = messageHdr.mime2DecodedRecipients;
  } catch(ex) {
    this.recipients = '(decoding failure)';
  }
  this.cc_list      = messageHdr.ccList;
  //this.flags      = "0x" + num2hex(messageHdr.flags);
  this.flags        = flagsToString(messageHdr.flags);
  this.num_lines    = messageHdr.lineCount;
  // by default, we're deleting dupes, but see also below
  this.toKeep       = false;
}

function flagsToString(flags) {
  var str = '';
  for (let flagName in RemoveDupes.MessageStatusFlags) {
    if (flags & RemoveDupes.MessageStatusFlags[flagName])
      str += ' | ' + flagName;
  }
  return str.replace(' | ','');
}

function initDupeReviewDialog() {

  // Since we no longer have per-platform-skin support, we set this attribute
  // on our root element, so that, in our stylesheet, we can contextualize using
  // this attribute, e.g.
  //
  //   dialog[platform="Darwin"] someElement {
  //     background-color: red;
  //   }
  //
  document.documentElement.setAttribute("platform",Services.appinfo.os);

  document.addEventListener("dialogaccept", function(event) { onAccept() || event.preventDefault(); } );
  document.addEventListener("dialogcancel", function(event) { onCancel(); } );

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
  document.getElementById('action').value = RemoveDupes.Prefs.get('default_action', null);
  dupeSetTree = document.getElementById("dupeSetsTree");

  // indicate which columns were used in the search

  for (let criterion in useCriteria) {
    if (useCriteria[criterion] && (criterion != 'body'))
      document.getElementById(criterion + 'Column')
              .setAttribute('comparisonCriterion',true);
  }

  // we re-form the dupe sets - instead of arrays of message URIs we
  // will now have arrays of DupeMessageRecord's, which contain much more
  // information (rather than having to repeatedly retrieve it)

  let dupesKnownNotToHaveCommonAccount = false;

  for (let hashValue in dupeSetsHashMap) {
    numberOfDupeSets++;
    var dupeSet = dupeSetsHashMap[hashValue];
    for (let i=0; i < dupeSet.length; i++) {
      let dmr = new DupeMessageRecord(dupeSet[i]);
      if (! dupesKnownNotToHaveCommonAccount) {
        if (!commonRootFolder) {
          commonRootFolder = dmr.rootFolder;
        }
        else {
         dupesKnownNotToHaveCommonAccount = ! (commonRootFolder == dmr.rootFolder);
        }
      }
      dupeSet[i] = dmr;
      if (originalsFolderUris) {
        // if we have pre-set originals folders, the default is to
        // keep all of messages in them and remove their dupes elsewhere
        dupeSet[i].toKeep = originalsFolderUris.has(dupeSet[i].folderUri);
      }
      totalNumberOfDupes++;
    }
    if (!originalsFolderUris) {
      // if we don't have pre-set originals,
      // the default is to keep the first dupe in each set
      dupeSet[0].toKeep = true;
    }
  }
  if (! dupesKnownNotToHaveCommonAccount) {
    document.getElementById('action').value = 'move_to_common_account_trash';
    let move_to_common_trash_element = document.getElementById('move_to_common_account_trash_action');
    move_to_common_trash_element.hidden = false;
    move_to_common_trash_element.disabled = false;
  }
  initializeDuplicateSetsTree();
}

function initializeDuplicateSetsTree() {
  dupeSetTree.currentItem = null;

  createMessageRowTemplate();
  var sortColumnId = dupeSetTree.getAttribute('sortColumn');
  if (sortColumnId)
    sortDupeSetsByField(document.getElementById(sortColumnId).getAttribute('fieldName'));

  for (let hashValue in dupeSetsHashMap) {
    if (originalsFolderUris) {
      // by default, dupes in the pre-set originals folders are kept
      dupeSetsHashMap[hashValue][0].toKeep = true;
    }
  }

  rebuildDuplicateSetsTree();
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

  var dummyCell         = document.createXULElement("treecell");
   // the dummy column stores no information but shows the [+] box
   // for expansion and the lines to the expanded rows
  var keepIndicatorCell = document.createXULElement("treecell");
  keepIndicatorCell.setAttribute("id", "keepIndicatorCell");
  //keepIndicatorCell.setAttribute("src", "chrome://messenger/skin/icons/notchecked.gif");
  var authorCell        = document.createXULElement("treecell");
  authorCell.setAttribute("id", "authorCell");
  var recipientsCell    = document.createXULElement("treecell");
  recipientsCell.setAttribute("id", "recipientsCell");
  var ccListCell    = document.createXULElement("treecell");
  ccListCell.setAttribute("id", "ccListCell");
  var subjectCell       = document.createXULElement("treecell");
  subjectCell.setAttribute("id", "subjectCell");
  var folderCell        = document.createXULElement("treecell");
  folderCell.setAttribute("id", "folderCell");
  var sendTimeCell      = document.createXULElement("treecell");
  sendTimeCell.setAttribute("id", "sendTimeCell");
  var sizeCell          = document.createXULElement("treecell");
  sizeCell.setAttribute("id", "sizeCell");
  var lineCountCell     = document.createXULElement("treecell");
  lineCountCell.setAttribute("id", "lineCountCell");
  var messageIdCell     = document.createXULElement("treecell");
  messageIdCell.setAttribute("id", "messageIdCell");
  var flagsCell         = document.createXULElement("treecell");
  flagsCell.setAttribute("id", "messageIdCell");

  messageRowTemplate = document.createXULElement("treerow");
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

function setStatusBarPanelText(panelId, text) {
  let panel = document.getElementById(panelId);
  // This works for statusbarpanel elements (used upto Thunderbird 68)
  panel.setAttribute("label", text);
  // This works for label elements (used starting with Thunderbird 68)
  panel.setAttribute("value", text);
}

function setNamedStatus(panelId, statusName) {
  setStatusBarPanelText(panelId, statusName ? RemoveDupes.Strings.getByName(statusName) : null);
}

function clearStatusBar() {
  setNamedStatus("total-status-panel","");
  setNamedStatus("sets-status-panel","");
  setNamedStatus("keeping-status-panel","");
  setNamedStatus("main-status-panel","");
}

function rebuildDuplicateSetsTree() {
  clearStatusBar();
  var dupeSetsTreeChildren = document.getElementById("dupeSetsTreeChildren");
  if (dupeSetsTreeChildren) {
    dupeSetTree.removeChild(dupeSetsTreeChildren);
  }

  dupeSetsTreeChildren = document.createXULElement("treechildren");
  dupeSetsTreeChildren.setAttribute("id","dupeSetsTreeChildren");

  setNamedStatus('main-status-panel','status_panel.populating_list');

  numberToKeep = 0;

  for (let hashValue in dupeSetsHashMap) {

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

    var dupeSetTreeChildrenInner  = document.createXULElement("treechildren");

    for (let i=0; i < dupeSet.length; i++) {
      if (dupeSet[i].toKeep) numberToKeep++;
      var dupeInSetRow = createMessageTreeRow(dupeSet[i]);
      var dupeInSetTreeItem = document.createXULElement("treeitem");
      dupeInSetTreeItem.setAttribute('indexInDupeSet', i);
      // TODO: does anyone know a simple way of getting the index of a treeitem within
      // its parent's childNodes?
      dupeInSetTreeItem.appendChild(dupeInSetRow);
      dupeSetTreeChildrenInner.appendChild(dupeInSetTreeItem);
    }

    var dupeSetTreeItem  = document.createXULElement("treeitem");
    dupeSetTreeItem.setAttribute('commonHashValue',hashValue);
    dupeSetTreeItem.appendChild(dupeSetTreeChildrenInner);
    dupeSetTreeItem.setAttribute("container", true);
    dupeSetTreeItem.setAttribute("open", true);

    dupeSetsTreeChildren.appendChild(dupeSetTreeItem);
  }
  // only with this statement does any of the tree contents become visible
  dupeSetTree.appendChild(dupeSetsTreeChildren);
  updateStatusBar();
}

function resetCheckboxValues() {
  clearStatusBar();
  var dupeSetsTreeChildren = document.getElementById("dupeSetsTreeChildren");
  setNamedStatus('main-status-panel','status_panel.updating_list');

  numberToKeep = 0;

  // to understand how this code works, see the comment regarding the tree
  // structure in the code of rebuildDuplicateSetsTree()

  var dupeSetTreeItem  = dupeSetsTreeChildren.firstChild;
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
  setStatusBarPanelText("sets-status-panel",
    RemoveDupes.Strings.getByName('status_panel.number_of_sets') + " " + numberOfDupeSets);
  setStatusBarPanelText("total-status-panel",
    RemoveDupes.Strings.getByName('status_panel.total_number_of_dupes') + " " + totalNumberOfDupes);
  setStatusBarPanelText("keeping-status-panel",
    RemoveDupes.Strings.getByName('status_panel.number_of_kept_dupes') + " " + numberToKeep);
  setStatusBarPanelText("main-status-panel","");
}

// createMessageTreeRow -
// To create the dupe set tree row for a specific message,
// we duplicate the row template and modify it with data
// from the messageRecord

function createMessageTreeRow(messageRecord) {

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
  return row;
}

// formatSendTime -
// Create a user-legible string for our seconds-since-epoch time value

function formatSendTime(sendTimeInSeconds) {
  var date = new Date( sendTimeInSeconds*1000 );
    // the Date() constructor expects miliseconds
  return DateTimeFormatter.format(date);
}

// onTreeKeyPress -
// Toggle the keep status for Space Bar

function onTreeKeyPress(ev) {
  if (ev.keyCode == KeyEvent.DOM_VK_SPACE) {
    toggleDeletionForCurrentRow();
  }
}

function onTreeKeyUp(ev) {
  if (selectedRow != dupeSetTree.currentIndex) {
    loadCurrentRowMessage();
    selectedRow = dupeSetTree.currentIndex;
  }
}

function getFocusedDupeTreeItem() {
  let view = dupeSetTree.view || dupeSetTree.contentView;
  return view.getItemAtIndex(dupeSetTree.currentIndex);
}

// onClickTree -
// Either toggle the deleted status of the message, load it for display,
// or do nothing

function onClickTree(ev) {

  dupeSetTreeBoxObject = dupeSetTree;

  var row = null;
  var col = null;

  try {
    let cell = dupeSetTreeBoxObject.getCellAt(ev.clientX, ev.clientY);
    row = cell.row;
    col = cell.col;
  } catch(ex) {
    let rowObject = {}, colObject = {}; obj = {};
    dupeSetTreeBoxObject.getCellAt(ev.clientX, ev.clientY, rowObject, col, obj);
    if (colObject.value) { col = colObject.value; }
    if (rowObject.value) { row = rowObject.value; }
  }

  if (   !col
      || !row
      || !col.index
      || !getFocusedDupeTreeItem().hasAttribute('indexInDupeSet')
     ) {
    // this isn't a valid cell we can use, or it's in one of the [+]/[-] rows
    return;
  }

  if (col.index == toKeepColumnIndex) {
    toggleDeletionForCurrentRow();
    return;
  }

  selectedRow = dupeSetTree.currentIndex;
  loadCurrentRowMessage();
}

// loadCurrentRowMessage -
// When the user selects a message row, we load that message in the 3-pane window

function loadCurrentRowMessage() {
  // when we click somewhere in the tree, the focused element should be an inner 'treeitem'
  var focusedTreeItem = getFocusedDupeTreeItem()
  var messageIndexInDupeSet = focusedTreeItem.getAttribute('indexInDupeSet');
  var dupeSetTreeItem = focusedTreeItem.parentNode.parentNode;
  var dupeSetHashValue = dupeSetTreeItem.getAttribute('commonHashValue');
  var dupeSetItem;
  try {
    dupeSetItem = dupeSetsHashMap[dupeSetHashValue][messageIndexInDupeSet];
  } catch(ex) {
    return;
  }

  var messageUri = dupeSetItem.uri;
  var folder = messenger.msgHdrFromURI(messageUri).folder;
  //msgFolder = folder.QueryInterface(Ci.nsIMsgFolder);
  //msgWindow.RerootFolderForStandAlone(folder.uri);
  //msgWindow.RerootFolder(folder.uri, msgFolder, gCurrentLoadingFolderViewType, gCurrentLoadingFolderViewFlags, gCurrentLoadingFolderSortType, gCurrentLoadingFolderSortOrder);

  msgWindow = msgWindow.QueryInterface(Ci.nsIMsgWindow);
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
  var focusedTreeItem = getFocusedDupeTreeItem();

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
  focusedRow.childNodes.item(toKeepColumnIndex)
            .setAttribute("properties", (dupeSetItem.toKeep ? "keep" : "delete"));

  updateStatusBar();
}

function onCancel() {
  dupeSetsHashMap = null;
}

// Note: This function returns true if any messages were deleted and no
// deletion failed, or false otherwise (in which case the dialog is not
// closed)
function onAccept() {
  if (totalNumberOfDupes == numberToKeep) { return false; }

  const HaveMessageRecords = true;

  let action = document.getElementById('action').getAttribute('value');
  let retVal;

  if (action == 'delete_permanently') {
	retVal = RemoveDupes.Removal.deleteMessages(window, msgWindow, dupeSetsHashMap, HaveMessageRecords);
  }
  else {
    let moveTargetFolder = null;
    if (action == 'move_to_chosen_folder') {
      if (!dupeMoveTargetFolder) {
        RemoveDupes.namedAlert(window, 'no_folder_selected');
        return false;
      }
      moveTargetFolder = dupeMoveTargetFolder;
      if (moveTargetFolder?.URI.length > 0) {
        RemoveDupes.Prefs.set('default_target_folder', moveTargetFolder.URI);
      }
    }
    else { // action is 'move_to_common_account_trash':
      if (!commonRootFolder) {
        // This shouldn't happen, but let's be on the safe side:
        RemoveDupes.namedAlert(window, 'no_common_account');
        return false;
      }
      moveTargetFolder = commonRootFolder.getFolderWithFlags(RemoveDupes.FolderFlags.Trash);
    }
    retVal = RemoveDupes.Removal.moveMessages(window, msgWindow, dupeSetsHashMap, moveTargetFolder, HaveMessageRecords);
  }
  if (retVal == false) { return false; }
  dupeSetsHashMap = null; // Is this necessary?
  return true;
}

function markAllDupesForDeletion() {
  for (let hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (let i=0; i<dupeSet.length; i++ )
      dupeSet[i].toKeep = false;
  }
  resetCheckboxValues();
}

function markKeepOneInEveryDupeSet(keepFirst) {
  // we'll mark either the first of every dupe set for keeping,
  // or the last of every set, and mark the rest for deletion

  for (let hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (let i=0; i<dupeSet.length; i++ ) {
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
  for (let hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (let i=0; i < dupeSet.length; i++ ) {
      dupeSet[i].toKeep = originalsFolderUris.has(dupeSet[i].folderUri);
    }
  }
  resetCheckboxValues();
}


function markNoDupesForDeletion() {
  for (let hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    for (let i=0; i<dupeSet.length; i++ )
      dupeSet[i].toKeep = true;
  }

  resetCheckboxValues();
}

function initializeFolderPicker() {
  var uri, msgFolder;
  // We might not have a pref for the default folder,
  // or the folder URIs may have changed for some reason
  try {
    uri = RemoveDupes.Prefs.get('default_target_folder', null);
    msgFolder = RemoveDupes.GetMsgFolderFromUri(uri, false);
  } catch(ex) { }

  if (!msgFolder) {
    uri = RemoveDupes.Removal.getLocalFoldersTrashFolder().URI;
    msgFolder = RemoveDupes.GetMsgFolderFromUri(uri, false);
  }

  try {
    document.getElementById('actionTargetFolderPopup').selectFolder(msgFolder);
  } catch(ex) { }
  dupeMoveTargetFolder = msgFolder;
}

// onClickColumn -
// Changes the sort order to be based on this column, or if this is already
// the case - toggles the sort direction - low to high values in this
// column or vice versa

function onClickColumn(ev) {
  ev.stopPropagation();

  var field = ev.target.getAttribute('fieldName');

  if (!field)
    return;

  if (dupeSetTree.getAttribute('sortColumn') == ev.target.id) {
    // re-clicking the current sort indicator means flipping the sort order
    dupeSetTree.setAttribute('sortDirection',
      (dupeSetTree.getAttribute('sortDirection') == 'ascending') ? 'descending' : 'ascending')
  }
  else {
    if (dupeSetTree.getAttribute('sortColumn')) {
      document.getElementById(dupeSetTree.getAttribute('sortColumn')).removeAttribute('class');
      document.getElementById(dupeSetTree.getAttribute('sortColumn')).removeAttribute('sortDirection');
    }
    dupeSetTree.setAttribute('sortColumn', ev.target.id);
    dupeSetTree.setAttribute('sortDirection', 'ascending');
  }

  sortDupeSetsByField(field);

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

  for (let hashValue in dupeSetsHashMap) {
    var dupeSet = dupeSetsHashMap[hashValue];
    dupeSet.sort(compareFunction);
  }
}

function onTargetFolderClick(targetFolder) {
  dupeMoveTargetFolder = targetFolder; // Note: Not a URI
  document.getElementById('actionTargetFolderPopup').selectFolder(targetFolder);
}

