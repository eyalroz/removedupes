function injectOtherElements() {
  WL.injectElements(
    `
    <popup id="folderPaneContext">
      <menuitem id="removeDuplicatesContextMenuItemsRemove"
        insertafter="folderPaneContext-copy-location"
        label="&removedupes.remove_duplicates_menuitems.remove.label;"
        oncommand="window.top.RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages(event);" />
      <menuitem id="removeDuplicatesContextMenuItemsSetOriginals"
        insertafter="removeDuplicatesMenuItemsRemove"
        label="&removedupes.remove_duplicates_menuitems.set_originals.label;"
        oncommand="window.top.RemoveDupes.MessengerOverlay.setOriginalsFolders(event);"/>
      <menuseparator id="folderPaneContext-removedupes-separator"
        insertafter="removeDuplicatesMenuItemsSetOriginals" />
    </popup>
`,
    [
      "chrome://removedupes/locale/removedupes.dtd",
      "chrome://removedupes/locale/removedupes-prefs.dtd",
    ],
    false // debugInjection
  );
}

const folderContextItemIds = [
  "removeDuplicatesContextMenuItemsRemove",
  "removeDuplicatesContextMenuItemsSetOriginals",
  "folderPaneContext-removedupes-separator",
];

function removeInjectedFolderContextItems() {
  for (const id of folderContextItemIds) {
    let item = document.getElementById(id);
    while (item) {
      item.remove();
      item = document.getElementById(id);
    }
  }
}

function onFolderPaneContextShowing(event) {
  if (event.target.id === "folderPaneContext") {
    removeInjectedFolderContextItems();
    injectOtherElements();
  }
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectOtherElements();
  WL.injectCSS("chrome://removedupes/content/skin/classic/removedupes-messenger.css");
  window.addEventListener("popupshowing", onFolderPaneContextShowing);
}

function onUnload(deactivatedWhileWindowOpen) {
  window.removeEventListener("popupshowing", onFolderPaneContextShowing);
}
