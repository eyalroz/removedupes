# removedupes: Remove duplicate messages<br>from Thunderbird mail folders

<sub>([See it also on `addons.thunderbird.net`](https://addons.thunderbird.net/en-US/thunderbird/addon/removedupes/))</sub>


So, you use the Thunderbird mail client, and...

* you have somehow managed to re-download some of them more than once due to some server error?
* or you're getting the same messages through different mail accounts?
* or you've just copied some messages into a large folder a while ago, and now wish you hadn't?

then removedupes is the extension for you!

* You pick the folder(s) to check for duplicates;
* Removedupes identifies and collects the duplicates.
* (Optionally) You get a dialog for reviewing the search results, picking and choosing what to keep or remove.
* Removedupes deletes all the duplicates, keeping the originals.

Pretty straightforward, right? And it is also safe: By default, "deletion" means moving to the Trash folder, so you can change your mind.

## The dupe review dialog in action

![removedupes in action](https://github.com/eyalroz/removedupes/blob/master/.github/images/basic_screenshot.png?raw=true)

Note that this is from an older version of Thunderbird; but the review dialog looks pretty much the same today.

## Key features

- Choice of multiple **comparison criteria** (subject, author, date, etc).
- Comparison of **message bodies** upon request.
- Ability to perform a dupe **search across multiple folders**.
- **Convenient review dialog** for double-checking which duplicates to delete and which to keep.
- Good **performance** on local folders with large number of messages; reasonable performance with IMAP and RSS accounts.
- Ability to **tweak criterion semantics** (e.g. time resolution, strip & sort addresses).
- Spiffy **toolbar button+menu** for running the dupe removal and enabling/disabling comparison criteria.

## <a name="credits">Credits</a>

Thanks goes out to:

*   The tireless translators of the [BabelZilla](http://www.babelzilla.org/) project.
*   alta88 (who prefers his relative anonymity) for QA help.
*   The denizens of [#mozilla.de@moznet](irc://irc.mozilla.org/%23mozilla.de) for some help with the German localization.
*   A good number of casual users who patiently and informatively reported bugs.

Special thanks to Moritz Abraham who was kind enough to delist his own rudimentary dupe removal extension in favor of this extension.


## Bugs, suggestions, feedback

### "Is the extension compatible with my version of Thunderbird?"

Thunderbird has been changing dramatically in recent years, and thuse different versions of the extension are compatible with different ranges of Thunderbird versions. At any given time, the latest release of the ectension _should_ be compatible with the latest release of Thunderbird; but as released are made, allow for a short period of time before the extension is updated to be compatible with the new release.

### "The extension isn't working! What's wrong?"

Read the [FAQ section of the wiki](https://github.com/eyalroz/removedupes/wiki/FAQ-(Frequently-Asked-Questions)); your answer is probably in there.

### I have a specific bug, issue, question or feature request

Please search the [issues page](https://github.com/eyalroz/removedupes/issues) of this repository, to check if it's already been reported. If not, file a new issue. If you'd like to tell me (the author) something about the extension and/or the state of Thunderbird in general - you can [write me](mailto:eyalroz1@gmx.com).

