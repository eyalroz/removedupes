// global variables

var messenger;
var msgWindow;
var dupeMessageRecords;
var dupeInSequenceIndicators;
var deletionIndicators;

var gTree;
var gTreeChildren;
var gMessageRowTemplate;
var gtreeLineIndexColumn;


const gDateService = 
  Components.classes["@mozilla.org/intl/scriptabledateformat;1"]
            .getService(Components.interfaces.nsIScriptableDateFormat);


function initShowMessagesDialog()
{
  // TODO: If we're only using some of the fields for comparison,
  // our messageRecords currently have 'null' instead of actual values
  // so either we make the columns go away, or we show the non-compared
  // fields too by filling up the messageRecords...

  messenger                 = window.arguments[0];
  msgWindow                 = window.arguments[1];
  dupeMessageRecords        = window.arguments[2];
  dupeInSequenceIndicators  = window.arguments[3];
  
  // initially, we mark for deletion every dupe which isn't
  // beginning a sequence
  
  deletionIndicators  = new Array(dupeInSequenceIndicators.length);
  for(var i=0; i<dupeInSequenceIndicators.length; i++)
    deletionIndicators[i] = dupeInSequenceIndicators[i];

  document.getElementById("delete_permanently").checked =
    !(gRemoveDupesPrefs.getBoolPref("move_to_trash_by_default", true));
  
  // we've already searched for dupes (they're in messageTable); let's
  // show them to the user, and let her/him decide what to do with them

  gTree = document.getElementById("dupeSequencesTree");
  gTree.currentItem = null;
  gTreeChildren = document.getElementById("dupeSequencesTreeChildren");
  gtreeLineIndexColumn = gTree.columns.getNamedColumn("treeLineIndex");

  createMessageRowTemplate();
  rebuildDuplicateSetsTree();
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
  var treeLineIndexCell     = document.createElement("treecell");
  treeLineIndexCell.setAttribute("id", "treeLineIndexCell");
  treeLineIndexCell.setAttribute("hidden", true);
  var keepIndicatorCell = document.createElement("treecell");
  keepIndicatorCell.setAttribute("id", "keepIndicatorCell");
  //keepIndicatorCell.setAttribute("src", "chrome://messenger/skin/icons/notchecked.gif");
  var authorCell        = document.createElement("treecell");
  authorCell.setAttribute("id", "authorCell");
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
  gMessageRowTemplate.appendChild(treeLineIndexCell);
  gMessageRowTemplate.appendChild(keepIndicatorCell);
  gMessageRowTemplate.appendChild(authorCell);
  gMessageRowTemplate.appendChild(subjectCell);
  gMessageRowTemplate.appendChild(folderCell);
  gMessageRowTemplate.appendChild(sendTimeCell);
  gMessageRowTemplate.appendChild(lineCountCell);

}


function rebuildDuplicateSetsTree()
{
#ifdef DEBUG_rebuildDuplicateSetsTree
      jsConsoleService.logStringMessage('dupeMessageRecords.length = ' + dupeMessageRecords.length);
   for (var i=0; i<dupeMessageRecords.length; i++ ) {
     jsConsoleService.logStringMessage('dupeInSequenceIndicators[i] = ' + dupeInSequenceIndicators[i] + ' ; deletionIndicators[i] = ' + deletionIndicators[i]);
   }
#endif

  while (gTreeChildren.firstChild)
   gTreeChildren.removeChild(gTreeChildren.firstChild);

  for (var i=0; i<dupeMessageRecords.length; i++ ) {
    // at this point, dupeMessageRecords[i] is always
    // the first message in a sequence of dupes

    var firstDupeMessageRow = createMessageTreeRow(dupeMessageRecords[i], deletionIndicators[i], i);
    var firstDupeMessageTreeItem = document.createElement("treeitem");
    var dummySequenceRow   = document.createElement("treerow");
    var sequenceRowsTreeChildren  = document.createElement("treechildren");

    firstDupeMessageTreeItem.appendChild(firstDupeMessageRow);
    sequenceRowsTreeChildren.appendChild(firstDupeMessageTreeItem);
  
    do {
      // there is always at least one dupe after the first one... so
      // this is a do-while, not while-do
      i++;
      var additionalSequenceMessageRow = createMessageTreeRow(dupeMessageRecords[i], deletionIndicators[i], i);
      var additionalSequenceMessageTreeItem = document.createElement("treeitem");
      additionalSequenceMessageTreeItem.appendChild(additionalSequenceMessageRow);
      sequenceRowsTreeChildren.appendChild(additionalSequenceMessageTreeItem);
    } while ( (i<dupeMessageRecords.length-1) && dupeInSequenceIndicators[i+1] );
  
    var sequenceTreeItem  = document.createElement("treeitem");

    sequenceTreeItem.appendChild(sequenceRowsTreeChildren);
    sequenceTreeItem.setAttribute("container", true);
    sequenceTreeItem.setAttribute("open", true);
   
    gTreeChildren.appendChild(sequenceTreeItem);
  }
}

function createMessageTreeRow(messageRecord, deleteIt, treeLineIndex)
{
#ifdef DEBUG_createMessageTreeRow
  jsConsoleService.logStringMessage('makeNewRow (\nmessageRecord=\n' + messageRecord + '\ndeleteIt = ' + deleteIt + ' treeLineIndex = ' + treeLineIndex + ')' );
#endif

  var row = gMessageRowTemplate.cloneNode(true);
    // a shallow clone should be enough, I think
  
  // recall we set the child nodes order in createMessageRowTemplate()
  
  row.childNodes.item(1).setAttribute("label", treeLineIndex);
  row.childNodes.item(2).setAttribute("properties", (deleteIt ? "delete" : "keep"));
  row.childNodes.item(3).setAttribute("label", messageRecord.author); 
  row.childNodes.item(4).setAttribute("label", messageRecord.subject);
  row.childNodes.item(5).setAttribute("label", messageRecord.folderName);
  row.childNodes.item(6).setAttribute("label", formatSendTime(messageRecord.sendTime));
  row.childNodes.item(7).setAttribute("label", messageRecord.lineCount);
#ifdef DEBUG_createMessageTreeRow
  jsConsoleService.logStringMessage('messageRecord.lineCount = ' + messageRecord.lineCount);
#endif

  return row;
}


function formatSendTime(sendTimeInSeconds)
{
  sendTimeInSeconds_in_seconds = new Date( sendTimeInSeconds*1000 );
    // the Date() constructor expects miliseconds
    
#ifdef DEBUG_formatSendTime
  jsConsoleService.logStringMessage('sendTimeInSeconds = ' + sendTimeInSeconds);
  jsConsoleService.logStringMessage('sendTimeInSeconds_in_seconds = ' + sendTimeInSeconds_in_seconds);
  jsConsoleService.logStringMessage('sendTimeInSeconds_in_seconds.getFullYear() = ' + sendTimeInSeconds_in_seconds.getFullYear());
  jsConsoleService.logStringMessage('sendTimeInSeconds_in_seconds.getMonth()+1 = ' + sendTimeInSeconds_in_seconds.getMonth()+1);
  jsConsoleService.logStringMessage('sendTimeInSeconds_in_seconds.getDate() = ' + sendTimeInSeconds_in_seconds.getDate());
  jsConsoleService.logStringMessage('sendTimeInSeconds_in_seconds.getHours() = ' + sendTimeInSeconds_in_seconds.getHours());
  jsConsoleService.logStringMessage('sendTimeInSeconds_in_seconds.getMinutes() = ' + sendTimeInSeconds_in_seconds.getMinutes());
#endif
  return gDateService.FormatDateTime(
    "", // use application locale
    gDateService.dateFormatShort,
    gDateService.timeFormatSeconds, 
    sendTimeInSeconds_in_seconds.getFullYear(),
    sendTimeInSeconds_in_seconds.getMonth()+1, 
    sendTimeInSeconds_in_seconds.getDate(),
    sendTimeInSeconds_in_seconds.getHours(),
    sendTimeInSeconds_in_seconds.getMinutes(), 
    sendTimeInSeconds_in_seconds.getSeconds() );
}

function findTreeRow(node, rowIndex )
{
  // TODO: use xpath to get this, or get all elements of name treecell, and search their id and label
  // see http://developer.mozilla.org/en/docs/Introduction_to_using_XPath_in_JavaScript
  
  if (   (node.nodeName == "treecell")
      && (node.getAttribute("id") == "treeLineIndexCell")
      && (node.getAttribute("label") == rowIndex) ) {
    return node.parentNode;
  }

  var node = node.firstChild;
  while(node != null) {
    var row = findTreeRow(node, rowIndex);
    if (row != null)
      return row;
    node = node.nextSibling;
  }

  return null;
}

function onDoubleClick()
{
  // If the user has double-clicked a message row, change it status
  // from 'Keep' to 'Delete' or vice-versa; otherwise do nothing
  
  var currentTreeIndex = gTree.currentIndex;

  var view = gTree.view;
  var recordIndex;

  recordIndex = view.getCellText(currentTreeIndex, gtreeLineIndexColumn);
  if (recordIndex == null)
    return;

#ifdef DEBUG_onDoubleClick
 // This doesn't work in tbird - no XPath support!
 var iterator = new XPathEvaluator();
 node = iterator.evaluate(
   '//treecell[id="treeLineIndexCell" and label="' + recordIndex + '"]',
   gTreeChildren, null, XPathResult.ANY_UNORDERED_NODE_TYPE, null ).singleNodeValue;

 if (node != null)
   jsConsoleService.logStringMessage('result node: ' + node + "\ntype: " + node.nodeType + "\nname: " + node.nodeName + "\nvalue:\n" + node.nodeValue + "\ndata:\n" + node.data);
 else jsConsoleService.logStringMessage('null result');
#endif
   
  var row = findTreeRow(gTreeChildren, recordIndex);
  if (row == null)
    return;

  deletionIndicators[recordIndex] = !deletionIndicators[recordIndex];

  row.childNodes.item(2).setAttribute(
    "properties", (deletionIndicators[recordIndex] ? "delete" : "keep"));
}

function onCancel()
{
  delete dupeMessageRecords;
  delete dupeInSequenceIndicators;
  delete deletionIndicators;
}

function onAccept()
{
  removeDuplicates(dupeMessageRecords,deletionIndicators,!(document.getElementById("delete_permanently").checked));
}


function markAllDupesForDeletion()
{
  for ( var i=0; i<dupeMessageRecords.length; i++ )
    deletionIndicators[i] = true;

  rebuildDuplicateSetsTree();
}

function markKeepOneInEveryDupeSet()
{
  // the sequence indicators are exactly what we need,
  // since they're false for the first in the sequence,
  // true for all other messages, i.e. one is kept, the rest
  // deleted

  for(var i=0; i<dupeInSequenceIndicators.length; i++)
    deletionIndicators[i] = dupeInSequenceIndicators[i];
  
  rebuildDuplicateSetsTree();
}



function markNoDupesForDeletion ()
{
  for ( var i=0; i<dupeMessageRecords.length; i++ )
    deletionIndicators[i] = false;

  rebuildDuplicateSetsTree();
}
