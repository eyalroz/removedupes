// visible prefs

pref("removedupes.search_subfolders", true);

pref("removedupes.comparison_criteria.message_id", true);
pref("removedupes.comparison_criteria.send_time", true);
pref("removedupes.comparison_criteria.folder", false);
pref("removedupes.comparison_criteria.subject", true);
pref("removedupes.comparison_criteria.author", true);
pref("removedupes.comparison_criteria.num_lines", false);
pref("removedupes.comparison_criteria.recipients", false);
pref("removedupes.comparison_criteria.cc_list", false);
pref("removedupes.comparison_criteria.flags", false);
pref("removedupes.comparison_criteria.body", false);

pref("removedupes.confirm_search_and_deletion", true);
pref("removedupes.default_action", 'move');

// hidden prefs

pref("removedupes.allowed_special_folders", "chrome://removedupes/locale/removedupes.properties");
pref('removedupes.default_target_folder', 'mailbox://nobody@Local%20Folders/Trash');

pref('removedupes.status_report_quantum',500);
pref('removedupes.yield_quantum',2500);
