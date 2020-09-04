// Note: This code is only relevant for Thunderbird versions 68 and later,
// where we can no longer use the XUL Preference element.

Preferences.addAll([
  { id: "extensions.removedupes.skip_special_folders",                   type: "bool"   },
  { id: "extensions.removedupes.skip_imap_deleted_messages",             type: "bool"   },
  { id: "extensions.removedupes.search_subfolders",                      type: "bool"   },
  { id: "extensions.removedupes.use_dialog_before_removal",              type: "bool"   },
  { id: "extensions.removedupes.default_action",                         type: "string" },
  { id: "extensions.removedupes.compare_stripped_and_sorted_addresses",  type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.author",             type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.recipients",         type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.cc_list",            type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.flags",              type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.message_id",         type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.num_lines",          type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.send_time",          type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.size",               type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.subject",            type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.folder",             type: "bool"   },
  { id: "extensions.removedupes.comparison_criteria.body",               type: "bool"   },
  { id: "extensions.removedupes.time_comparison_resolution",             type: "string" },
]);

