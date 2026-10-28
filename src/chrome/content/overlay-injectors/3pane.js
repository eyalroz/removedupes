var ADDON_ID = "{a300a000-5e21-4ee0-a115-9ec8f4eaa92b}";
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

function isCurrentTab(tabId) {
  if (!tabId) { return false;  }
  try {
    const { ExtensionParent } = ChromeUtils.importESModule(
      "resource://gre/modules/ExtensionParent.sys.mjs"
    );
    const extension = ExtensionParent.GlobalManager.getExtension(ADDON_ID);
    const tabMail = window?.top?.gTabmail;
    if (!tabMail) {
      console.warn("Could not determine current tabId: gTabmail is not available, top window:", window.top);
      return false;
    }
    const tabInfo = tabMail.currentTabInfo;
    const currentTabId = extension.tabManager.getWrapper(tabInfo).id;
    return tabId === currentTabId;
  } catch (ex) {
    console.error("Could not determine current tabId", ex);
    return false;
  }
}

const DEBUG = false;
function logDebug(...args) {
  if (DEBUG) {
    console.log("[REMOVE DUPLICATES]\n", ...args);
  }
}

function onNotifyExperiment(data) {
  logDebug("onNotifyExperiment", {this:this, data:data, win:window.location.href});
  switch (data.event) {
    case "searchAndRemoveDuplicateMessages":
      if (!isCurrentTab(data?.tabId)) {
        logDebug(`Ignoring notification for other tab: ${data?.tabId}`);
        return;
      }
      window.top.RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages(null);
      break;
  }
}

function addEventListeners() {
  document
    .getElementById("folderPaneContext")
    .addEventListener("popupshowing", onFolderPaneContextPopupShowing);
  logDebug("Adding listener for NotifyTools.onNotifyExperiment", this);
  this.notifyListenerId = this.notifyTools.addListener(onNotifyExperiment);
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectOtherElements();

  var { ExtensionParent } = ChromeUtils.importESModule(
    "resource://gre/modules/ExtensionParent.sys.mjs"
  );
  let ext = ExtensionParent.GlobalManager.getExtension(ADDON_ID);
  Services.scriptloader.loadSubScript(
    ext.rootURI.resolve("chrome/content/notifyTools.js"),
    this,
    "UTF-8"
  );

  this.notifyTools.setAddOnId(ADDON_ID);
  addEventListeners();
}

function onUnload(activatedWhileWindowOpen) {
  document
    .getElementById("folderPaneContext")
    .removeEventListener("popupshowing", onFolderPaneContextPopupShowing);
  logDebug("Removing listener for NotifyTools.onNotifyExperiment", this);
  this.notifyTools.removeListener(this.notifyListenerId);
}
