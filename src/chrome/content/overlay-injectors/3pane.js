const Services = globalThis.Services || ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;

function injectOtherElements() {
   WL.injectElements(
    `
    <popup id="folderPaneContext">
      <menuitem id="removeDuplicatesContextMenuItemsRemove"
        insertafter="folderPaneContext-copy-location"
        label="&removedupes.remove_duplicates_menuitems.remove.label;"
        oncommand="window.top.RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages();" />
      <menuitem id="removeDuplicatesContextMenuItemsSetOriginals"
        insertafter="removeDuplicatesMenuItemsRemove"
        label="&removedupes.remove_duplicates_menuitems.set_originals.label;"
        oncommand="window.top.RemoveDupes.MessengerOverlay.setOriginalsFolders();"/>
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
  WL.injectCSS("chrome://removedupes/content/skin/classic/removedupes-messenger.css");
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectOtherElements();
}

