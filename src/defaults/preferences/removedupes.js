// visible prefs

pref("removedupes.search_subfolders", true);
pref("removedupes.skip_special_folders", true);

pref("removedupes.compare_stripped_and_sorted_addresses", false);
// possible values are: seconds, minutes, hours, day, month, year
pref("removedupes.time_comparison_resolution", "seconds");
pref("removedupes.comparison_criteria.allow_md5_id_substitute", false);

pref("removedupes.comparison_criteria.message_id", true);
pref("removedupes.comparison_criteria.send_time", true);
pref("removedupes.comparison_criteria.size", true);
pref("removedupes.comparison_criteria.folder", false);
pref("removedupes.comparison_criteria.subject", true);
pref("removedupes.comparison_criteria.author", true);
pref("removedupes.comparison_criteria.num_lines", false);
pref("removedupes.comparison_criteria.recipients", false);
pref("removedupes.comparison_criteria.cc_list", false);
pref("removedupes.comparison_criteria.flags", false);
pref("removedupes.comparison_criteria.body", false);

pref("removedupes.use_dialog_before_removal", true);
pref("removedupes.confirm_permanent_deletion", true);
pref("removedupes.default_action", 'move');

pref("removedupes.limit_number_of_processed_messages", false);
pref("removedupes.processed_messages_limit", 10000);


// hidden prefs

// no default for 'removedupes.default_target_folder'

pref('removedupes.status_report_quantum',500);
pref('removedupes.yield_quantum',2500);
