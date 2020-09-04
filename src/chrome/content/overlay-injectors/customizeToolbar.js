// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  WL.injectCSS("chrome://removedupes/content/skin/classic/removedupes-button.css");
}

// called on window unload or on add-on deactivation while window is still open
function onUnload(deactivatedWhileWindowOpen) {
    // no need to clean up UI on global shutdown
    if (!deactivatedWhileWindowOpen)
        return;
}

