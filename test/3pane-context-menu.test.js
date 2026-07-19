const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const contextMenuItemIds = [
  "removeDuplicatesContextMenuItemsRemove",
  "removeDuplicatesContextMenuItemsSetOriginals",
  "folderPaneContext-removedupes-separator",
];

test("restores folder context menu items after Thunderbird rebuilds the menu", () => {
  const menuItems = [];
  const listeners = new Map();
  const document = {
    getElementById(id) {
      const item = menuItems.find((candidate) => candidate.id === id);
      if (!item) {
        return null;
      }
      return {
        remove() {
          menuItems.splice(menuItems.indexOf(item), 1);
        },
      };
    },
  };
  const window = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) {
        listeners.delete(type);
      }
    },
    dispatchEvent(event) {
      listeners.get(event.type)?.(event);
    },
  };
  const WL = {
    injectCSS() {},
    injectElements() {
      contextMenuItemIds.forEach((id) => menuItems.push({ id }));
    },
  };
  const context = vm.createContext({ document, WL, window });
  const injectorPath = path.join(__dirname, "../src/chrome/content/overlay-injectors/3pane.js");

  vm.runInContext(fs.readFileSync(injectorPath, "utf8"), context);
  context.onLoad(false);
  menuItems.length = 0;
  window.dispatchEvent({ type: "popupshowing", target: { id: "folderPaneContext" } });
  window.dispatchEvent({ type: "popupshowing", target: { id: "folderPaneContext" } });

  assert.deepEqual(
    menuItems.map(({ id }) => id),
    contextMenuItemIds,
    "folder context commands should be restored exactly once when the menu opens"
  );
});
