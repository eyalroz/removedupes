const { RemoveDupes } = ChromeUtils.import("chrome://removedupes/content/removedupes-common.js");
const { MailUtils   } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");

var msgWindow;
  // the 3-pane window which opened us
var messenger;
  // msgWindow's messenger
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

const FieldNames = [
  // the dummy column stores no information but shows the [+] box
  // for expansion and the lines to the expanded rows
  'dummy', 'toKeep', 'author', 'recipients', 'ccList', 'subject',
  'folderName', 'sendTime', 'size', 'lineCount', 'messageId', 'flags'
];

var formattingOptions = {
  year:   'numeric',
  month:  'numeric',
  day:    'numeric',
  hour:   'numeric',
  minute: 'numeric',
  second: 'numeric',
  timeZoneName: 'short'
};

// DupeMessageRecord - a self-describing class;
// each dupe message in each dupe set will have a record built
var DupeMessageRecord = function (messageUri) {
  let messageHdr  = messenger.msgHdrFromURI(messageUri);

  this.uri          = messageUri;
  this.folderName   = messageHdr.folder.abbreviatedName;
  this.folderUri    = messageHdr.folder.URI;
  this.rootFolder   = messageHdr.folder.server.rootFolder;
    // the root folder is used for checking whether all messages are from the same account
  this.messageId    = ((allowMD5IDSubstitutes || messageHdr.messageId.substr(0, 4) != 'md5:') ?
    messageHdr.messageId : '');
  this.sendTime     = messageHdr.dateInSeconds;
  this.size         = messageHdr.messageSize;
  this.subject      = messageHdr?.mime2DecodedSubject    ?? '(decoding failure)';
  this.author       = messageHdr?.mime2DecodedAuthor     ?? '(decoding failure)';
  this.recipients   = messageHdr?.mime2DecodedRecipients ?? '(decoding failure)';
  this.ccList       = messageHdr.recipients;
  this.flags        = flagsToString(messageHdr.flags);
  this.lineCount    = messageHdr.lineCount;
  // by default, we're deleting dupes, but see also below
  this.toKeep       = false;
};

function flagsToString(flags) {
  let str = '';
  for (let flagName in RemoveDupes.MessageStatusFlags) {
    if (flags & RemoveDupes.MessageStatusFlags[flagName]) {
      str += ` | ${flagName}`;
    }
  }
  return str.replace(' | ', '');
}

// This function re-forms the dupe sets - it replaces the arrays of message URIs,
// with arrays of DupeMessageRecord's, containing additional useful information
// about the dupe message.
function enrichDupeInfo() {
  let dupesKnownNotToHaveCommonAccount = false;
  for (let hashValue in dupeSetsHashMap) {
    dupeSetsHashMap[hashValue] = dupeSetsHashMap[hashValue].map(
      // eslint-disable-next-line no-loop-func
      (uri) => {
        let dmr = new DupeMessageRecord(uri);
        if (!dupesKnownNotToHaveCommonAccount) {
          if (!commonRootFolder) {
            commonRootFolder = dmr.rootFolder;
          } else {
            dupesKnownNotToHaveCommonAccount = !(commonRootFolder == dmr.rootFolder);
          }
        }
        if (originalsFolderUris) {
          // if we have pre-set originals folders, the default is to
          // keep all messages in them and remove their dupes elsewhere
          dmr.toKeep = originalsFolderUris.has(dmr.folderUri);
        }
        return dmr;
      });
    if (!originalsFolderUris) {
      // if we don't have pre-set originals,
      // the default is to keep the first dupe in each set
      dupeSetsHashMap[hashValue][0].toKeep = true;
    }
    totalNumberOfDupes += dupeSetsHashMap[hashValue].length;
  }
  numberOfDupeSets += Object.keys(dupeSetsHashMap).length;
  return dupesKnownNotToHaveCommonAccount;
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
  document.documentElement.setAttribute("platform", Services.appinfo.os);

  document.addEventListener("dialogaccept", (event) => { onAccept() || event.preventDefault(); });
  document.addEventListener("dialogcancel", () => { onCancel(); });

  // TODO: If we're only using some of the fields for comparison,
  // our messageRecords currently have 'null' instead of actual values
  // so either we make the columns go away, or we show the non-compared
  // fields too by filling up the messageRecords...

  messenger              = window.arguments[0];
  msgWindow              = window.arguments[1];
  // XXX TO DO:
  // Do we need this argument?
  useCriteria            = window.arguments[2];
  dupeSetsHashMap        = window.arguments[3];
  originalsFolderUris    = window.arguments[4];
  allowMD5IDSubstitutes  = window.arguments[5];

  // let's replace the URI's with all the necessary information
  // for the display dialog:

  numberOfDupeSets = 0;
  totalNumberOfDupes = 0;

  // if no folders were pre-set as the 'originals', let's not
  // have the button mentioning them
  document.getElementById('keepPresetOriginalButton')
          .setAttribute('hidden', (!originalsFolderUris));
  initializeFolderPicker();
  dupeSetTree = document.getElementById("dupeSetsTree");

  // indicate which columns were used in the search

  for (let criterion in useCriteria) {
    if (useCriteria[criterion] && (criterion != 'body')) {
      document.getElementById(`${criterion}Column`)
              .setAttribute('comparisonCriterion', true);
    }
  }

  let dupesKnownNotToHaveCommonAccount = enrichDupeInfo();
  let move_to_common_trash_element = document.getElementById('move_to_common_account_trash_action');
  move_to_common_trash_element.disabled = Boolean(dupesKnownNotToHaveCommonAccount);

  let defaultAction = RemoveDupes.Prefs.get('default_action', null);
  let action;

  if (defaultAction && (defaultAction != 'move_to_common_account_trash' || !dupesKnownNotToHaveCommonAccount)) {
    action = defaultAction;
  } else if (!dupesKnownNotToHaveCommonAccount) {
    action = 'move_to_common_account_trash';
  } else {
    // Dupes aren't known to have a common trash folder
    action = 'move_to_chosen_folder';
  }

  let actionRadio = document.getElementById(`${action}_action`);
  document.getElementById('action').selectedItem = actionRadio;

  initializeDuplicateSetsTree();
}

function initializeDuplicateSetsTree() {
  dupeSetTree.currentItem = null;

  createMessageRowTemplate();
  let sortColumnId = dupeSetTree.getAttribute('sortColumn');
  if (sortColumnId) {
    // TODO: Don't look for the "field" attribute of the sort column, just parse its name;
    // and actually, let's keep the field name to begin with
    let sortColumn = document.getElementById(sortColumnId);
    if (sortColumn) {
      sortDupeSetsByField(document.getElementById(sortColumnId).getAttribute('fieldName'));
    }
  }

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
  // TODO: consider whether we want to display/not display
  // certain fields based on whether they were in the comparison
  // criteria or not (or maybe display them in the top treerow
  // rather than in the unfolded rows)

  let createCell = function (colName) {
    let cell = document.createXULElement('treecell');
    cell.setAttribute('id', `${colName}Cell`);
    return cell;
  };

  messageRowTemplate = document.createXULElement("treerow");
  for (const colName of FieldNames) {
    messageRowTemplate.appendChild(createCell(colName));
  }
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
  setNamedStatus("total-status-panel", "");
  setNamedStatus("sets-status-panel", "");
  setNamedStatus("keeping-status-panel", "");
  setNamedStatus("main-status-panel", "");
}

function rebuildDuplicateSetsTree() {
  clearStatusBar();
  let dupeSetsTreeChildren = document.getElementById("dupeSetsTreeChildren");
  if (dupeSetsTreeChildren) {
    dupeSetTree.removeChild(dupeSetsTreeChildren);
  }

  dupeSetsTreeChildren = document.createXULElement("treechildren");
  dupeSetsTreeChildren.setAttribute("id", "dupeSetsTreeChildren");

  setNamedStatus('main-status-panel', 'status_panel.populating_list');

  numberToKeep = 0;

  for (let hashValue in dupeSetsHashMap) {
    let dupeSet = dupeSetsHashMap[hashValue];

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

    let dupeSetTreeChildrenInner  = document.createXULElement("treechildren");

    for (let i = 0; i < dupeSet.length; i++) {
      if (dupeSet[i].toKeep) numberToKeep++;
      let dupeInSetRow = createMessageTreeRow(dupeSet[i]);
      let dupeInSetTreeItem = document.createXULElement("treeitem");
      dupeInSetTreeItem.setAttribute('indexInDupeSet', i);
      // TODO: does anyone know a simple way of getting the index of a treeitem within
      // its parent's childNodes?
      dupeInSetTreeItem.appendChild(dupeInSetRow);
      dupeSetTreeChildrenInner.appendChild(dupeInSetTreeItem);
    }

    let dupeSetTreeItem  = document.createXULElement("treeitem");
    dupeSetTreeItem.setAttribute('commonHashValue', hashValue);
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
  let dupeSetsTreeChildren = document.getElementById("dupeSetsTreeChildren");
  setNamedStatus('main-status-panel', 'status_panel.updating_list');

  numberToKeep = 0;

  // to understand how this code works, see the comment regarding the tree
  // structure in the code of rebuildDuplicateSetsTree()

  let dupeSetTreeItem  = dupeSetsTreeChildren.firstChild;
  while (dupeSetTreeItem) {
    let hashValue = dupeSetTreeItem.getAttribute('commonHashValue');
    let dupeSet = dupeSetsHashMap[hashValue];
    let dupeInSetTreeItem = dupeSetTreeItem.firstChild.firstChild;
    while (dupeInSetTreeItem) {
      let indexInDupeSet = parseInt(dupeInSetTreeItem.getAttribute('indexInDupeSet'), 10);

      dupeInSetTreeItem.firstChild.childNodes.item(FieldNames.indexOf('toKeep')).setAttribute(
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
    `${RemoveDupes.Strings.getByName('status_panel.number_of_sets')} ${numberOfDupeSets}`);
  setStatusBarPanelText("total-status-panel",
    `${RemoveDupes.Strings.getByName('status_panel.total_number_of_dupes')} ${totalNumberOfDupes}`);
  setStatusBarPanelText("keeping-status-panel",
    `${RemoveDupes.Strings.getByName('status_panel.number_of_kept_dupes')} ${numberToKeep}`);
  setStatusBarPanelText("main-status-panel", "");
}

// createMessageTreeRow -
// To create the dupe set tree row for a specific message,
// we duplicate the row template and modify it with data
// from the messageRecord

{
  var DateTimeFormatter = new Services.intl.DateTimeFormat(undefined, formattingOptions);

  function createMessageTreeRow(messageRecord) {
    let row = messageRowTemplate.cloneNode(true);
      // a shallow clone is enough here

    let massageValue = (fieldName, value) => {
      switch (fieldName) {
      case 'sendTime': {
        let sendTimeInMilliseconds = value * 1000;
        return DateTimeFormatter.format(new Date(sendTimeInMilliseconds));
      }
      case 'toKeep':   return value ? "keep" : "delete";
      default:         return value;
      }
    };
    // Note we're skipping the first column, which doesn't really
    // correspond to a field
    FieldNames.slice(1).forEach((fieldName, index) => {
      let attributeName =  (fieldName == 'toKeep') ? 'properties' : 'label';
      let attributeValue = massageValue(fieldName, messageRecord[fieldName]);
      row.childNodes.item(index + 1).setAttribute(attributeName, attributeValue);
    });

    return row;
  }
}

// onTreeKeyPress -
// Toggle the keep status for Space Bar

function onTreeKeyPress(ev) {
  if (ev.code == KeyEvent.DOM_VK_SPACE) {
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
  let dupeSetTreeBoxObject = dupeSetTree;

  let row = null;
  let col = null;

  try {
    let cell = dupeSetTreeBoxObject.getCellAt(ev.clientX, ev.clientY);
    row = cell.row;
    col = cell.col;
  } catch (ex) {
    let rowObject = {}, colObject = {}, obj = {};
    dupeSetTreeBoxObject.getCellAt(ev.clientX, ev.clientY, rowObject, col, obj);
    if (colObject.value) { col = colObject.value; }
    if (rowObject.value) { row = rowObject.value; }
  }

  if (!col || !row || !col.index ||
      !getFocusedDupeTreeItem().hasAttribute('indexInDupeSet')) {
    // this isn't a valid cell we can use, or it's in one of the [+]/[-] rows
    return;
  }

  if (col.index == FieldNames.indexOf('toKeep')) {
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
  let focusedTreeItem = getFocusedDupeTreeItem();
  let messageIndexInDupeSet = focusedTreeItem.getAttribute('indexInDupeSet');
  let dupeSetTreeItem = focusedTreeItem.parentNode.parentNode;
  let dupeSetHashValue = dupeSetTreeItem.getAttribute('commonHashValue');
  let dupeSetItem;
  try {
    dupeSetItem = dupeSetsHashMap[dupeSetHashValue][messageIndexInDupeSet];
  } catch (ex) {
    console.log(`Failed loading the currently-reviewed dupe message for display in the 3-pane window:\n${ex}`);
    return;
  }

  let messageUri = dupeSetItem.uri;
  let messageHeader = messenger.msgHdrFromURI(messageUri);

  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  if (mail3PaneWindow) {
    mail3PaneWindow.MsgDisplayMessageInFolderTab(messageHeader);
    if (Ci.nsIMessengerWindowsIntegration) {
      Cc["@mozilla.org/messenger/osintegration;1"]
        .getService(Ci.nsIMessengerWindowsIntegration)
        .showWindow(mail3PaneWindow);
    }
  }

  // MailUtils.displayMessageInFolderTab(messageHeader);
}

function toggleDeletionForCurrentRow() {
  let focusedTreeItem = getFocusedDupeTreeItem();

  // The user has clicked a message row, so change it status
  // from 'Keep' to 'Delete' or vice-versa

  let messageIndexInDupeSet = focusedTreeItem.getAttribute('indexInDupeSet');
  let dupeSetTreeItem = focusedTreeItem.parentNode.parentNode;
  let dupeSetHashValue = dupeSetTreeItem.getAttribute('commonHashValue');
  let dupeSetItem = dupeSetsHashMap[dupeSetHashValue][messageIndexInDupeSet];

  if (dupeSetItem.toKeep) {
    dupeSetItem.toKeep = false;
    numberToKeep--;
  } else {
    dupeSetItem.toKeep = true;
    numberToKeep++;
  }
  let focusedRow = focusedTreeItem.firstChild;
  focusedRow.childNodes.item(FieldNames.indexOf('toKeep'))
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
  } else {
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
    } else { // action is 'move_to_common_account_trash':
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
    for (let dupe of dupeSetsHashMap[hashValue]) {
      dupe.toKeep = false;
    }
  }
  resetCheckboxValues();
}

function markKeepOneInEveryDupeSet(keepFirst) {
  // we'll mark either the first of every dupe set for keeping,
  // or the last of every set, and mark the rest for deletion

  for (let hashValue in dupeSetsHashMap) {
    let dupeSet = dupeSetsHashMap[hashValue];
    for (let dupe of dupeSet) {
      dupe.toKeep = false;
    }
    dupeSet[keepFirst ? 0 : (dupeSet.length - 1)].toKeep = true;
  }

  resetCheckboxValues();
}

function markKeepPresetOriginals() {
  for (let hashValue in dupeSetsHashMap) {
    let dupeSet = dupeSetsHashMap[hashValue];
    for (let dupe of dupeSet) {
      dupe.toKeep = originalsFolderUris.has(dupe.folderUri);
    }
  }
  resetCheckboxValues();
}


function markNoDupesForDeletion() {
  for (let hashValue in dupeSetsHashMap) {
    for (let dupe of dupeSetsHashMap[hashValue]) {
      dupe.toKeep = true;
    }
  }

  resetCheckboxValues();
}

function initializeFolderPicker() {
  let uri, msgFolder = null;
  // We might not have a pref for the default folder,
  // or the folder URIs may have changed for some reason
  try {
    uri = RemoveDupes.Prefs.get('default_target_folder', null);
    msgFolder = MailUtils.getExistingFolder(uri);
  } catch (ex) { }

  if (!msgFolder) {
    uri = RemoveDupes.Removal.getLocalFoldersTrashFolder().URI;
    msgFolder = MailUtils.getExistingFolder(uri);
  }

  try {
    document.getElementById('actionTargetFolderPopup').selectFolder(msgFolder);
  } catch (ex) { }
  dupeMoveTargetFolder = msgFolder;
}

// onClickColumn -
// Changes the sort order to be based on this column, or if this is already
// the case - toggles the sort direction - low to high values in this
// column or vice versa

function onClickColumn(ev) {
  ev.stopPropagation();

  let field = ev.target.getAttribute('fieldName');

  if (!field) {
    return;
  }

  if (dupeSetTree.getAttribute('sortColumn') == ev.target.id) {
    // re-clicking the current sort indicator means flipping the sort order
    dupeSetTree.setAttribute('sortDirection',
      (dupeSetTree.getAttribute('sortDirection') == 'ascending') ? 'descending' : 'ascending');
  } else {
    if (dupeSetTree.getAttribute('sortColumn')) {
      // TODO: Don't keep the column Id, but rather the column name; then we can use `${columnName}Column` for the ID
      let sortColumnName = dupeSetTree.getAttribute('sortColumn');
      let fieldName = sortColumnName.replace(/Column$/, '');
      if (FieldNames.includes(fieldName)) { // Sanity check...
        let previousSortColumn = document.getElementById(sortColumnName);
        previousSortColumn.removeAttribute('class');
        previousSortColumn.removeAttribute('sortDirection');
      }
    }
    dupeSetTree.setAttribute('sortColumn', ev.target.id);
    dupeSetTree.setAttribute('sortDirection', 'ascending');
  }

  sortDupeSetsByField(field);

  ev.target.setAttribute('class', 'sortDirectionIndicator');
  ev.target.setAttribute('sortDirection', dupeSetTree.getAttribute('sortDirection'));
  rebuildDuplicateSetsTree();
}

// sortDupeSetsByField -
// re-sorts the messages to respect the order column selection

function sortDupeSetsByField(field) {
  // we will now re-sort every dupe set using the field whose
  // column the user has clicked

  let compareFunction = function (lhs, rhs) {
    if (lhs[field] == rhs[field]) {
      return 0;
    }
    let descending = dupeSetTree.getAttribute('sortDirection') == 'descending';
    let lhsIsGreater = lhs[field] > rhs[field];
    return ((descending && lhsIsGreater) || (!descending && !lhsIsGreater)) ? -1 : 1;
  };

  // TODO: see if you can't use the XUL tree's internal sorting mechanism; if we do that, we'll be able to
  // spare lots of tree-rebuilding

  for (let hashValue in dupeSetsHashMap) {
    dupeSetsHashMap[hashValue].sort(compareFunction);
  }
}

function onTargetFolderClick(targetFolder) {
  dupeMoveTargetFolder = targetFolder; // Note: Not a URI
  document.getElementById('actionTargetFolderPopup').selectFolder(targetFolder);
}

