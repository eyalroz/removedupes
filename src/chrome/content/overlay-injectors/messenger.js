var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var debugInjection = false;

Services.scriptloader.loadSubScript("chrome://removedupes/content/removedupes.js", window, "UTF-8");

function injectToolbarButton() {
  WL.injectElements(`
    <toolbarpalette id="MailToolbarPalette">
      <toolbarbutton id="removedupes-button"
                     oncommand="RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages();"
                     label="&removeduplicates-button.label;"
                     tooltiptext="&removeduplicates-button.tip;"
                     type="menu-button"
					 is="toolbarbutton-menu-button"
                     insertafter="qfb-show-filter-bar"
                     removable="true"
                     class="toolbarbutton-1 chromeclass-toolbar-additional custombutton">
        <menupopup onpopupshowing="RemoveDupes.MessengerOverlay.criteriaPopupMenuInit()">
          <label value="&removedupes.criteria_menu.label;" style="font-weight: bold"/>
          <menuseparator />
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_author"
                    label="&message_comparison.author.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'author')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_recipients"
                    label="&message_comparison.recipients.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'recipients')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_cc_list"
                    label="&message_comparison.cc_list.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'cc_list')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_flags"
                    label="&message_comparison.flags.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'flags')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_message_id"
                    label="&message_comparison.message_id.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'message_id')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_num_lines"
                    label="&message_comparison.num_lines.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'num_lines')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_send_time"
                    label="&message_comparison.send_time.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'send_time')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_size"
                    label="&message_comparison.size.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'size')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_subject"
                    label="&message_comparison.subject.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'subject')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_folder"
                    label="&message_comparison.folder.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'folder')"/>
          <menuitem type="checkbox"
                    id="removedupesCriterionMenuItem_body"
                    label="&message_comparison.body.label;"
                    oncommand="RemoveDupes.MessengerOverlay.toggleDupeSearchCriterion(event,'body')"/>
        </menupopup>
      </toolbarbutton>
    </toolbarpalette>`,
    [
      "chrome://removedupes/locale/removedupes.dtd",
      "chrome://removedupes/locale/removedupes-prefs.dtd"
    ],
    debugInjection
  );
  WL.injectCSS("chrome://removedupes/content/skin/classic/removedupes-button.css");
}

function injectOtherElements() {
  WL.injectElements(`
    <keyset id="mailKeys">
      <key id="key-removedupes"
  	 modifiers="&key-removedupes.modifiers;"
  	 key="&key-removedupes.keycode;"
  	 oncommand="RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages();"
      /> 
    </keyset>

    <popup id="folderPaneContext">
      <menuitem id="removeDuplicatesContextMenuItemsRemove" 
  	      insertafter="folderPaneContext-copy-location"
  	      label="&removedupes.remove_duplicates_menuitems.remove.label;"
  	      oncommand="RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages();" />
      <menuitem id="removeDuplicatesContextMenuItemsSetOriginals" 
  	      insertafter="removeDuplicatesMenuItemsRemove"
  	      label="&removedupes.remove_duplicates_menuitems.set_originals.label;"
  	      oncommand="RemoveDupes.MessengerOverlay.setOriginalsFolders();"/> 
      <menuseparator id="folderPaneContext-removedupes-separator" 
  	      insertafter="removeDuplicatesMenuItemsSetOriginals" />  
    </popup> 
    
    <menupopup id="taskPopup">
      <menuseparator id="sep-removedupes"/>
      <menuitem id="removeDuplicatesToolsMenuItemsRemove"
  	      insertafter="sep-removedupes"
  	      label="&removedupes.remove_duplicates_menuitems.remove.label;"
  	      accesskey="&removedupes.remove_duplicates_menuitems.remove.accesskey;" 
  	      oncommand="RemoveDupes.MessengerOverlay.searchAndRemoveDuplicateMessages();" />
      <menuitem id="removeDuplicatesToolsMenuItemsSetOriginals" 
  	      insertafter="removedupes-menuitem"
  	      label="&removedupes.remove_duplicates_menuitems.set_originals.label;"
  	      accesskey="&removedupes.remove_duplicates_menuitems.set_originals.accesskey;" 
  	      oncommand="RemoveDupes.MessengerOverlay.setOriginalsFolders();"/>
    </menupopup>`,
    [
      "chrome://removedupes/locale/removedupes.dtd",
      "chrome://removedupes/locale/removedupes-prefs.dtd"
    ],
    debugInjection
  );
  WL.injectCSS("chrome://removedupes/content/skin/classic/removedupes-messenger.css");
}

// called on window load or on add-on activation while window is already open
function onLoad(activatedWhileWindowOpen) {
  injectToolbarButton();
  injectOtherElements();
}

// called on window unload or on add-on deactivation while window is still open
function onUnload(deactivatedWhileWindowOpen) {
  // no need to clean up UI on global shutdown
  if (!deactivatedWhileWindowOpen)
    return;
  // If we've added any elements not through WL.inject functions - we need to remove
  // them manually here. The WL-injected elements get auto-removed
}
