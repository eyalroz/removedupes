function injectOtherElements() {
   WL.injectElements(
    `
    <popup id="folderPaneContext">
      <menuseparator id="removeDuplicatesContextMenuItemsSeparator" hidden="true"/>
      <menuitem id="removeDuplicatesContextMenuItemsRemove"
        label="&removedupes.remove_duplicates_menuitems.remove.label;"
        oncommand="window.top.RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages(event);" />
      <menuitem id="removeDuplicatesContextMenuItemsSetOriginals"
        insertafter="removeDuplicatesContextMenuItemsRemove"
        label="&removedupes.remove_duplicates_menuitems.set_originals.label;"
        oncommand="window.top.RemoveDupes.MessengerOverlay.setOriginalsFolders(event);"/>
    </popup>
`,
    [
      "chrome://removedupes/locale/removedupes.dtd",
      "chrome://removedupes/locale/removedupes-prefs.dtd",
    ],
    false // debugInjection
  );
  WL.injectCSS("chrome://removedupes/content/skin/classic/removedupes-messenger.css");
}

function getPreviousVisibleSibling(element) {
  element = element?.previousElementSibling;
  while (element) {
    if (!(element.hasAttribute("hidden"))) {
      return element;
    }
    element = element?.previousElementSibling;
  }
  return null;
}

function unhideFolderContextMenuItems() {
  const itemIdsToUnhide = [
    "removeDuplicatesContextMenuItemsRemove",
    "removeDuplicatesContextMenuItemsSetOriginals"
  ];
  for (const id of itemIdsToUnhide) {
    document.getElementById(id)?.removeAttribute("hidden");
  }
  let separator = document.getElementById("removeDuplicatesContextMenuItemsSeparator");
  let previousVisible = getPreviousVisibleSibling(separator);
  if (previousVisible?.nodeName == "menuseparator") {
    separator.setAttribute("hidden", "");
  } else {
    separator.removeAttribute("hidden");
  }
}

function onFolderPaneContextPopupShowing(event) {
  if (event.target?.id == "folderPaneContext") {
    unhideFolderContextMenuItems();
  }
}

function addEventListeners() {
  document
    .getElementById("folderPaneContext")
    .addEventListener("popupshowing", onFolderPaneContextPopupShowing);
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectOtherElements();
  addEventListeners();
}

function onUnload(activatedWhileWindowOpen) {
  document
    .getElementById("folderPaneContext")
    .removeEventListener("popupshowing", onFolderPaneContextPopupShowing);
}
