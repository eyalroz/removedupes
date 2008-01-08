// global variables

var messenger;
var msgWindow;
var gMessengerBundle;
var gDBView;
var gDupeSetsHashMap;

var gTree;
var gTreeChildren;
var gMessageRowTemplate;
var gtreeLineUriColumn;

// statistical info displayed on the status bar

var gNumberOfDupeSets;
var gTotalNumberOfDupes;
var gNumberToKeep;

// indices of columns in dupe tree rows

const toKeepColumnIndex      = 1;
const authorColumnIndex      = 2;
const recipientsColumnIndex  = 3;
const ccListColumnIndex      = 4;
const subjectColumnIndex     = 5;
const folderNameColumnIndex  = 6;
const sendTimeColumnIndex    = 7;
const lineCountColumnIndex   = 8;

// state variables for dupe set sorting (see onClickColumn() )

const gDateService = 
  Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
            .getService(Components.interfaces.nsIScriptableDateFormat);


function dupeMessageRecord(messageUri)
{
  var messageHdr  = messenger.msgHdrFromURI(messageUri);
  
  this.uri          = messageUri;
  this.folder_name  = messageHdr.folder.abbreviatedName;
  this.folder       = messageHdr.folder.URI;
  this.message_id   = messageHdr.messageId;
  this.send_time    = formatSendTime(messageHdr.dateInSeconds);
  this.subject      = messageHdr.mime2DecodedSubject;
  this.author       = messageHdr.mime2DecodedAuthor;
  this.recipients   = messageHdr.mime2DecodedRecipients;
  this.cc_list      = messageHdr.ccList;
    // we don't have mime2DecodedRecipients
  this.num_lines   = messageHdr.lineCount;
  // by default, we're deleting dupes, but see also below
  this.toKeep      = false; 
}

function initDupeReviewDialog()
{
#ifdef DEBUG_profile
  gStartTime = (new Date()).getTime();
#endif

  // TODO: If we're only using some of the fields for comparison,
  // our messageRecords currently have 'null' instead of actual values
  // so either we make the columns go away, or we show the non-compared
  // fields too by filling up the messageRecords...

  messenger                 = window.arguments[0];
  msgWindow                 = window.arguments[1];
  gMessengerBundle          = window.arguments[2];
  gDBView                   = window.arguments[3];
  var useCriteria           = window.arguments[4];
  gDupeSetsHashMap          = window.arguments[5];
  
  // let's replace the URI's with all the necessary information
  // for the display dialog:

  gNumberOfDupeSets = 0;
  gTotalNumberOfDupes = 0;
  
  initializeFolderPicker();
  document.getElementById('action').value  = gRemoveDupesPrefs.getCharPref('default_action', 'move');
  gTree = document.getElementById("dupeSetsTree");
  
  // indicate which columns were used in the search
  
  for(criterion in useCriteria) {
#ifdef DEBUG_initDupeReviewDialog
      jsConsoleService.logStringMessage('criterion = ' + criterion);
#endif
    if (useCriteria[criterion] &&
        (criterion != 'message_id') &&
        (criterion != 'body'))
      document.getElementById(criterion + 'Column').setAttribute('comparisonCriterion',true);
  }
  
  // we re-form the dupe sets - instead of arrays of message URIs we
  // will now have arrays of dupeMessageRecord's, which contain much more
  // information (rather than having to repeatedly retrieve it)
  
  for (hashValue in gDupeSetsHashMap) {
    gNumberOfDupeSets++;
    var dupeSet = gDupeSetsHashMap[hashValue];
    for (var i=0; i < dupeSet.length; i++) {
      dupeSet[i] = new dupeMessageRecord(dupeSet[i]);
      gTotalNumberOfDupes++;
#ifdef DEBUG_initDupeReviewDialog
      jsConsoleService.logStringMessage('dupe ' + i + ' for hash value ' + hashValue + ':\n' + dupeSet[i].uri);
#endif
      
    }
  }
#ifdef DEBUG_profile
  gEndTime = (new Date()).getTime();
  jsConsoleService.logStringMessage('dupe sets hash decoration time = ' + (gEndTime-gStartTime) + ' ms');
  gStartTime = (new Date()).getTime();
#endif
  
  
  // now let's show the information about the dupes to the user,
  // and let her/him decide what to do with them

#ifdef DEBUG_initDupeReviewDialog
  jsConsoleService.logStringMessage('gTree = ' + gTree);
#endif
  gTree.currentItem = null;
  gTreeChildren = document.getElementById("dupeSetsTreeChildren");
#ifdef DEBUG_initDupeReviewDialog
  jsConsoleService.logStringMessage('gTreeChildren = ' + gTreeChildren);
#endif

  createMessageRowTemplate();
  var sortColumnId = gTree.getAttribute('sortColumn');
  if (sortColumnId)
    sortDupeSetsByField(document.getElementById(sortColumnId).getAttribute('fieldName'));

  for (hashValue in gDupeSetsHashMap) {
    // first dupe in a dupe set is kept by default
    gDupeSetsHashMap[hashValue][0].toKeep = true;
  }

  rebuildDuplicateSetsTree();
#ifdef DEBUG_profile
  gEndTime = (new Date()).getTime();
  jsConsoleService.logStringMessage('rebuildDuplicateSetsTree time = ' + (gEndTime-gStartTime) + ' ms');
  gStartTime = (new Date()).getTime();
#endif
}

function createMessageRowTemplate()
{
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
  var lineCountCell     = document.createElement("treecell");
  lineCountCell.setAttribute("id", "lineCountCell");

  gMessageRowTemplate = document.createElement("treerow");
  gMessageRowTemplate.appendChild(dummyCell);
  gMessageRowTemplate.appendChild(keepIndicatorCell);
  gMessageRowTemplate.appendChild(authorCell);
  gMessageRowTemplate.appendChild(recipientsCell);
  gMessageRowTemplate.appendChild(ccListCell);
  gMessageRowTemplate.appendChild(subjectCell);
  gMessageRowTemplate.appendChild(folderCell);
  gMessageRowTemplate.appendChild(sendTimeCell);
  gMessageRowTemplate.appendChild(lineCountCell);
  gMessageRowTemplate.setAttribute('indexInDupeSet', 0);
}

function clearStatusBar()
{
  document.getElementById("total-status-panel").setAttribute("label", "");
  document.getElementById("sets-status-panel").setAttribute("label", "");
  document.getElementById("keeping-status-panel").setAttribute("label", "");
  document.getElementById("main-status-panel").setAttribute("label","");
}



function rebuildDuplicateSetsTree()
{
#ifdef DEBUG_rebuildDuplicateSetsTree
      jsConsoleService.logStringMessage('in rebuildDuplicateSetsTree');
#endif

  clearStatusBar();

  while (gTreeChildren.firstChild)
   gTreeChildren.removeChild(gTreeChildren.firstChild);

  document.getElementById("main-status-panel").setAttribute("label",
    gRemoveDupesStrings.GetStringFromName("removedupes.status_panel.populating_list"));

  gNumberToKeep = 0;

  for (hashValue in gDupeSetsHashMap) {

    var dupeSet = gDupeSetsHashMap[hashValue];

    // Every XUL tree has a single treechildren element. The treechildren
    // for the global tree of the 'removedupes' dialog has a treeitem for every
    // dupe set. Now things get a bit complicated, as for each dupe set we
    // have an internal tree (so that we can collapse/expand the elements of a
    // dupe set):
    //
    //  tree
    //   \---treechildren (global)
    //         +--treeitem (for 1st dupe set)
    //         +--treeitem (for 2nd dupe set)
    //         |     \---treechildren
    //         |            +---treeitem (for 1st message in 2nd set; not expanded here)
    //         |            +---treeitem (for 2nd message in 2nd set)
    //         |            |      \---treerow (for 2nd message in 2nd set)
    //         |            |             +---treecell (some bit of info about 2nd message in 2nd set)
    //         |            |             \---treecell (other bit of info about 2nd message in 2nd set)
    //         |            \---treeitem (for 3rd message in 2nd set; not expanded here)
    //         \--treeitem (for 3rd dupe set; not expanded here)

    var dupeSetTreeChildren  = document.createElement("treechildren");
    
    for (var i=0; i < dupeSet.length; i++) {
      if (dupeSet[i].toKeep) gNumberToKeep++;
      var dupeInSetRow = createMessageTreeRow(dupeSet[i]);
      var dupeInSetTreeItem = document.createElement("treeitem");
      dupeInSetTreeItem.setAttribute('indexInDupeSet', i);
        // TODO: does anyone know a simple way of getting the index of a treeitem within
        // its parent's childNodes?
      dupeInSetTreeItem.appendChild(dupeInSetRow);
      dupeSetTreeChildren.appendChild(dupeInSetTreeItem);
    }
  
    var dupeSetTreeItem  = document.createElement("treeitem");
    dupeSetTreeItem.setAttribute('commonHashValue',hashValue);
    dupeSetTreeItem.appendChild(dupeSetTreeChildren);
    dupeSetTreeItem.setAttribute("container", true);
    dupeSetTreeItem.setAttribute("open", true);
   
    gTreeChildren.appendChild(dupeSetTreeItem);
  }
  updateStatusBar();
}

function resetCheckboxValues()
{
#ifdef DEBUG_resetCheckboxValues
      jsConsoleService.logStringMessage('in resetCheckboxValues');
#endif

  clearStatusBar();

  document.getElementById("main-status-panel").setAttribute("label",
    gRemoveDupesStrings.GetStringFromName("removedupes.status_panel.updating_list"));

  gNumberToKeep = 0;

  // to understand how this code works, see the comment regarding the tree
  // structure in the code of rebuildDuplicateSetsTree()

  var dupeSetTreeItem  =  gTreeChildren.firstChild;
  while (dupeSetTreeItem) {
    var hashValue = dupeSetTreeItem.getAttribute('commonHashValue');
    var dupeSet = gDupeSetsHashMap[hashValue];
    var dupeInSetTreeItem = dupeSetTreeItem.firstChild.firstChild;
    while (dupeInSetTreeItem) {
      var indexInDupeSet = parseInt(dupeInSetTreeItem.getAttribute('indexInDupeSet'));
      
      dupeInSetTreeItem.firstChild.childNodes.item(toKeepColumnIndex).setAttribute(
        "properties", (dupeSet[indexInDupeSet].toKeep ? "keep" : "delete"));

      if (dupeSet[indexInDupeSet].toKeep) gNumberToKeep++;
      dupeInSetTreeItem = dupeInSetTreeItem.nextSibling;
    }
    dupeSetTreeItem = dupeSetTreeItem.nextSibling;
  }
  updateStatusBar();
}


function updateStatusBar()
{
  document.getElementById("sets-status-panel").setAttribute("label",
    gRemoveDupesStrings.GetStringFromName("removedupes.status_panel.number_of_sets") + " " + gNumberOfDupeSets);
  document.getElementById("total-status-panel").setAttribute("label", 
    gRemoveDupesStrings.GetStringFromName("removedupes.status_panel.total_number_of_dupes") + " " + gTotalNumberOfDupes);
  document.getElementById("keeping-status-panel").setAttribute("label", 
    gRemoveDupesStrings.GetStringFromName("removedupes.status_panel.number_of_kept_dupes") + " " + gNumberToKeep);
  document.getElementById("main-status-panel").setAttribute("label", "");

}

function createMessageTreeRow(messageRecord)
{
#ifdef DEBUG_createMessageTreeRow
  jsConsoleService.logStringMessage('makeNewRow');
#endif

  var row = gMessageRowTemplate.cloneNode(true);
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
  // the send time is already formatted
  row.childNodes.item(sendTimeColumnIndex)
     .setAttribute("label", messageRecord.send_time);
  row.childNodes.item(lineCountColumnIndex)
     .setAttribute("label", messageRecord.num_lines);
#ifdef DEBUG_createMessageTreeRow
  jsConsoleService.logStringMessage('messageRecord.lineCount = ' + messageRecord.lineCount);
#endif

  return row;
}


function formatSendTime(sendTimeInSeconds)
{
  var date = new Date( sendTimeInSeconds*1000 );
    // the Date() constructor expects miliseconds
    
#ifdef DEBUG_formatSendTime
  jsConsoleService.logStringMessage('sendTimeInSeconds = ' + sendTimeInSeconds);
  jsConsoleService.logStringMessage('date = ' + date);
  jsConsoleService.logStringMessage('date.getFullYear() = ' + date.getFullYear());
  jsConsoleService.logStringMessage('date.getMonth()+1 = ' + date.getMonth()+1);
  jsConsoleService.logStringMessage('date.getDate() = ' + date.getDate());
  jsConsoleService.logStringMessage('date.getHours() = ' + date.getHours());
  jsConsoleService.logStringMessage('date.getMinutes() = ' + date.getMinutes());
#endif
  return gDateService.FormatDateTime(
    "", // use application locale
    gDateService.dateFormatShort,
    gDateService.timeFormatSeconds, 
    date.getFullYear(),
    date.getMonth()+1, 
    date.getDate(),
    date.getHours(),
    date.getMinutes(), 
    date.getSeconds() );
}

function onClickTree(ev)
{
#ifdef DEBUG_onClickTree
  jsConsoleService.logStringMessage('in onClickTree()\nclick point = ' + ev.clientX + ':' + ev.clientY);
#endif

  var treeBoxOject = gTree.treeBoxObject;
  var row = {}, col = {}, obj = {};
  treeBoxOject.getCellAt(ev.clientX, ev.clientY, row, col, obj);

//  var x = {}, y = {}, w = {}, h = {};
//  treeBoxOject.getCoordsForCellItem(row.value, col.value, "treecell", x, y, w, h);

  if (   !col.value
      || !row.value 
      || !col.value.index 
      || !gTree.contentView.getItemAtIndex(gTree.currentIndex).hasAttribute('indexInDupeSet') ) {
    // this isn't a valid cell we can use, or it's in one of the [+]/[-] rows
#ifdef DEBUG_onClickTree
    jsConsoleService.logStringMessage('not a valid cell, doing nothing');
#endif
    return;
  }

  if (col.value.index == toKeepColumnIndex) {
    toggleDeletionForCurrentRow();
    return;
  }

  loadCurrentRowMessage();
}

function loadCurrentRowMessage()
{
#ifdef DEBUG_loadCurrentRowMessage
  jsConsoleService.logStringMessage('in loadCurrentRowMessage()\ngTree.currentIndex = ' + gTree.currentIndex);
#endif
  // when we click somewhere in the tree, the focused element should be an inner 'treeitem'
  var focusedTreeItem = gTree.contentView.getItemAtIndex(gTree.currentIndex);
  var messageIndexInDupeSet = focusedTreeItem.getAttribute('indexInDupeSet');
  var dupeSetTreeItem = focusedTreeItem.parentNode.parentNode;
#ifdef DEBUG_loadCurrentRowMessage
  var node = dupeSetTreeItem;
  jsConsoleService.logStringMessage('dupeSetTreeItem: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
  var node = dupeSetTreeItem.parentNode;
  jsConsoleService.logStringMessage('dupeSetTreeItem.parentNode: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
  var node = dupeSetTreeItem.parentNode.parentNode;
  jsConsoleService.logStringMessage('dupeSetTreeItem.parentNode.parentNode: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
#endif
  var dupeSetHashValue = dupeSetTreeItem.getAttribute('commonHashValue');
#ifdef DEBUG_loadCurrentRowMessage
  jsConsoleService.logStringMessage('dupeSetHashValue = ' + dupeSetHashValue);
#endif
  var dupeSetItem = gDupeSetsHashMap[dupeSetHashValue][messageIndexInDupeSet];
  var messageUri = dupeSetItem.uri;
  var folder = messenger.msgHdrFromURI(messageUri).folder;
  //msgFolder = folder.QueryInterface(Components.interfaces.nsIMsgFolder);
  //msgWindow.RerootFolderForStandAlone(folder.uri);
  //msgWindow.RerootFolder(folder.uri, msgFolder, gCurrentLoadingFolderViewType, gCurrentLoadingFolderViewFlags, gCurrentLoadingFolderSortType, gCurrentLoadingFolderSortOrder);

//nsIMsgWindow
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

function toggleDeletionForCurrentRow()
{
#ifdef DEBUG_toggleDeletionForCurrentRow
  jsConsoleService.logStringMessage('in toggleDeletionForCurrentRow()\ngTree.currentIndex = ' + gTree.currentIndex);
#endif
  var focusedTreeItem = gTree.contentView.getItemAtIndex(gTree.currentIndex);

  // The user has clicked a message row, so change it status
  // from 'Keep' to 'Delete' or vice-versa
  
  var messageIndexInDupeSet = focusedTreeItem.getAttribute('indexInDupeSet');
  var dupeSetTreeItem = focusedTreeItem.parentNode.parentNode;
  var dupeSetHashValue = dupeSetTreeItem.getAttribute('commonHashValue');
  var dupeSetItem = gDupeSetsHashMap[dupeSetHashValue][messageIndexInDupeSet];
  
  if (dupeSetItem.toKeep) {
    dupeSetItem.toKeep = false;
    gNumberToKeep--;  
  }
  else {
    dupeSetItem.toKeep = true;
    gNumberToKeep++;  
  }
  focusedRow = focusedTreeItem.firstChild;
  focusedRow.childNodes.item(toKeepColumnIndex).setAttribute(
    "properties", (dupeSetItem.toKeep ? "keep" : "delete"));
    
  updateStatusBar();
}

function onCancel()
{
  delete gDupeSetsHashMap;
}

function onAccept()
{
  var uri = document.getElementById('actionTargetFolder').getAttribute('uri');
  var deletePermanently =
    (document.getElementById('action').getAttribute('value') == 'delete_permanently');
  removeDuplicates(
    gDupeSetsHashMap,
    deletePermanently,
    uri,
    true // the uri's have been replaced with messageRecords
    );
  if (!deletePermanently) 
    gRemoveDupesPrefs.setCharPref('default_target_folder', uri);
  delete gDupeSetsHashMap;
}


function markAllDupesForDeletion()
{
  for (hashValue in gDupeSetsHashMap) {
    var dupeSet = gDupeSetsHashMap[hashValue];
    for (var i=0; i<dupeSet.length; i++ )
      dupeSet[i].toKeep = false;
  }
  resetCheckboxValues();
}

function markKeepOneInEveryDupeSet(keepFirst)
{
  // we'll mark either the first of every dupe set for keeping,
  // or the last of every set, and mark the rest for deletion
 
  for (hashValue in gDupeSetsHashMap) {
    var dupeSet = gDupeSetsHashMap[hashValue];
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

function markNoDupesForDeletion()
{
  for (hashValue in gDupeSetsHashMap) {
    var dupeSet = gDupeSetsHashMap[hashValue];
    for (var i=0; i<dupeSet.length; i++ )
      dupeSet[i].toKeep = true;
  }

  resetCheckboxValues();
}

function initializeFolderPicker()
{
  var uri = gRemoveDupesPrefs.getCharPref('default_target_folder', null);
    
#ifdef DEBUG_initializeFolderPicker
  jsConsoleService.logStringMessage('setting folder picker to uri:\n' + uri);
#endif
    
  // TODO: perhaps we don't need this when also calling SetFolderPicker ?
  MsgFolderPickerOnLoad('actionTargetFolder');

  if ( (uri == null) || (uri == "") )
    return;

  //var msgFolder = GetMsgFolderFromUri(uri, false);
  SetFolderPicker(uri, 'actionTargetFolder');
}

function onClickColumn(ev)
{
#ifdef DEBUG_onClickColumn
  jsConsoleService.logStringMessage('in onClickColumn()');
#endif
  ev.stopPropagation();
  
  var field = ev.target.getAttribute('fieldName');

#ifdef DEBUG_onClickColumn
  jsConsoleService.logStringMessage('field = ' + field + '\ngTree.getAttribute(\'sortColumn\') = ' + gTree.getAttribute('sortColumn') );
#endif
  
  if (!field)
    return;

  if (gTree.getAttribute('sortColumn') == ev.target.id) {
#ifdef DEBUG_onClickColumn
    jsConsoleService.logStringMessage('reclick ; gTree.getAttribute(\'sortDirection\') = ' + gTree.getAttribute('sortDirection'));
#endif
    // re-clicking the current sort indicator means flipping the sort order
    gTree.setAttribute('sortDirection',
      (gTree.getAttribute('sortDirection') == 'ascending') ? 'descending' : 'ascending')
  }
  else {
    if (gTree.getAttribute('sortColumn')) {
#ifdef DEBUG_onClickColumn
      jsConsoleService.logStringMessage('clearing old sort column');
#endif
      document.getElementById(gTree.getAttribute('sortColumn')).removeAttribute('class');
      document.getElementById(gTree.getAttribute('sortColumn')).removeAttribute('sortDirection');
    }
    gTree.setAttribute('sortColumn', ev.target.id);
#ifdef DEBUG_onClickColumn
    jsConsoleService.logStringMessage('set gTree.getAttribute(\'sortColumn\') to' + gTree.getAttribute('sortColumn'));
#endif
    gTree.setAttribute('sortDirection', 'ascending');
  }
  
  sortDupeSetsByField(field);

#ifdef DEBUG_onClickColumn
  jsConsoleService.logStringMessage('setting attrs on new sort column' + ev.target + "\nto class and " + gTree.getAttribute('sortDirection'));
#endif
  ev.target.setAttribute('class','sortDirectionIndicator');
  ev.target.setAttribute('sortDirection',gTree.getAttribute('sortDirection'));
  rebuildDuplicateSetsTree();
}

function sortDupeSetsByField(field)
{
  // we will now re-sort every dupe set using the field whose
  // column the user has clicked
  
  var compareFunction = function(lhs, rhs) {
    if (lhs[field] == rhs[field])
      return 0;
    if (gTree.getAttribute('sortDirection') == 'descending')
      return ( (lhs[field] > rhs[field]) ? -1 : 1);
    else
      return ( (lhs[field] > rhs[field]) ? 1 : -1);
  };

  // TODO: see if you can't use the XUL tree's internal sorting mechanism; if we do that, we'll be able to
  // spare lots of tree-rebuilding

  for (hashValue in gDupeSetsHashMap) {
    var dupeSet = gDupeSetsHashMap[hashValue];
    dupeSet.sort(compareFunction);
  }
}