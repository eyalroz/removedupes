function injectOtherElements() {
   WL.injectElements(
    `
    <popup id="folderPaneContext">
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

function unhideFolderContextMenuItems() {
  const removeDupesFolderContextIds = [
    "removeDuplicatesContextMenuItemsRemove",
    "removeDuplicatesContextMenuItemsSetOriginals",
  ];

  for (const id of removeDupesFolderContextIds) {
    document.getElementById(id)?.removeAttribute("hidden");
  }
}

function onFolderPaneContextPopupShowing(event) {
  if (event.target?.id == "folderPaneContext") {
    unhideFolderContextMenuItems();
    // TODO: Make sure that our two items are separated by a visible separator from the
    // previous item
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
