// visible prefs

pref("extensions.removedupes.search_subfolders", true);
pref("extensions.removedupes.skip_special_folders", true);
pref("extensions.removedupes.skip_imap_deleted_messages", true);

pref("extensions.removedupes.compare_stripped_and_sorted_addresses", false);
// possible values are: seconds, minutes, hours, day, month, year
pref("extensions.removedupes.time_comparison_resolution", "seconds");
pref("extensions.removedupes.comparison_criteria.allow_md5_id_substitute", false);

pref("extensions.removedupes.comparison_criteria.message_id", true);
pref("extensions.removedupes.comparison_criteria.send_time", true);
pref("extensions.removedupes.comparison_criteria.size", true);
pref("extensions.removedupes.comparison_criteria.folder", false);
pref("extensions.removedupes.comparison_criteria.subject", true);
pref("extensions.removedupes.comparison_criteria.author", true);
pref("extensions.removedupes.comparison_criteria.num_lines", false);
pref("extensions.removedupes.comparison_criteria.recipients", false);
pref("extensions.removedupes.comparison_criteria.cc_list", false);
pref("extensions.removedupes.comparison_criteria.flags", false);
pref("extensions.removedupes.comparison_criteria.body", false);

pref("extensions.removedupes.use_dialog_before_removal", true);
pref("extensions.removedupes.confirm_permanent_deletion", true);
pref("extensions.removedupes.default_action", 'move');

pref("extensions.removedupes.limit_number_of_processed_messages", false);
pref("extensions.removedupes.processed_messages_limit", 10000);


// hidden prefs

// no default for 'extensions.removedupes.default_target_folder'

pref('extensions.removedupes.status_report_quantum',500);
pref('extensions.removedupes.yield_quantum',2500);
