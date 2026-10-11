# removedupes: Remove duplicate messages<br>from Thunderbird mail folders

<sub>[![Featured on `addons.thunderbird.net`](https://img.shields.io/badge/featured_on-addons.thunderbird.net-blue?style=plastic)](https://addons.thunderbird.net/en-US/thunderbird/addon/removedupes/)</sub>


| Table of contents |
|:------------------|
|<sub>[Introduction](#removedupes-remove-duplicate-messagesfrom-thunderbird-mail-folders)<br>[The dupe review dialog in action](#the-dupe-review-dialog-in-action)<br>[Key features](#key-features)<br>["Why does the extension miss some of my duplicates?"](#why-does-the-extension-miss-some-of-my-duplicates)<br>[Originals folders and search folders](#originals-folders-and-search-folders)<br>[Credits](#credits)<br>[Bugs, suggestions, feedback](#bugs-suggestions-feedback)</sub>|


So, you use the Thunderbird mail client, and...

* you have somehow managed to re-download some messages twice due to some server error?
* you're getting copies of the same messages through different mail accounts?
* you copy some messages into a larger folder, and later decide you shouldn't have?

then **removedupes** is the extension for you!

1. You selectthe folder(s) to check for duplicates;
2. *removedupes* identifies and collects the sets of duplicate (or triplicate etc.) messages.
3. You get a dialog for reviewing the search results, picking and choosing what to keep or remove.
4. *removedupes* deletes the duplicates, keeping the originals.

Pretty straightforward, right? And it is also safe: By default, "deletion" means moving to the Trash folder, so you can change your mind. Of course - if you clear your trash, the messages are gone for good.

## The dupe review dialog in action

![removedupes in action](https://github.com/eyalroz/removedupes/blob/master/.github/images/basic_screenshot.png?raw=true)

Note that this is from an older version of Thunderbird; but the review dialog looks pretty much the same today.

## Key features

- Choice of multiple **comparison criteria** (subject, author, date, etc).
- Comparison of **message bodies** upon request.
- Ability to perform a dupe **search across multiple folders**.
- **Convenient review dialog** for double-checking which duplicates to delete and which to keep.
- Good **performance** on local folders with large number of messages; reasonable performance with IMAP and RSS accounts.
- Ability to **limit search to copies of messages in certain 'originals' folders**; see below for details.
- Ability to **tweak criterion semantics** (e.g. time resolution, strip & sort addresses).
- The extension *used* to have a piffy toolbar button+menu for running the dupe removal and enabling/disabling comparison criteria; but Thunderbird dropped the toolbar widget for the main window, and the not-quite-toolbar widget is exceedingly difficult to overlay.

## "Why does the extension miss some of my duplicates?"

An occasional complaint among users is, that they know they have certain duplicates in a folder, but the extension claims that there are no dupes. This is (almost always) not a bug, but a case of **near-duplicate** messages:

* A pair of messages can be almost-identical to each other, e.g. only differ by their send time, because a mail server sent them more than once. 
* A pair of messages may only _appear_ almost-identical, and actually differ: A person sends you a message, then resends it a few moments later with an attachment. The latter message will have the same Subject, Author, To+CC+BCC fields; and the send time may be a few seconds apart, like in the example of a real pair of almost-identical messages

If our message comparison criterion includes the send time header - we will declare both the first pair and the second pair as "not duplicates", even though we may prefer the second pair were considered dupes, and only the second pair considered distinct. But if we compared messages using, say, Subject and Author - we would declare both pairs as pairs of duplicates - which is a mistake regarding the second pair.

For this reason (and not just this reason), the extension defaults to using more, rather than less, comparison criteria: A relatively 'conservative' determination of duplicates, so as to err on the side of caution. If you know you have some near-duplicates, and want them to be identifed as dupes with copies deleted - you need to **relax the comparison criteria** until you see duplicates in the search, **then tighten them again** to make sure you don't catch message pairs you didn't intend to.

Note that some criteria are very delicate, and Thunderbird's message storage layer may introduce artificial differences between otherwise identical messages: An extra empty line, or one less empty line, at the end of a message, may appear; and this may change the values of *Message Size*, *Number of Lines* and *Body*. Also, messages in IMAP may have statistics reported for them by Thunderbird which do not regard the message body, with these criteria artificially differing. And yet - sometimes you definitely want to compare message bodies.

## Originals folders and search folders

Sometimes, you want to search folder *Foo* for copies of messages in folder *Bar*. But - *Foo* may have duplicate messages all by itself, which you do not want to touch (or - messages which appear to be duplicates using your chosen comparison criteria). This can happen if you want to undo the copying of some messages from *Bar* to *Foo*, but not right after the copy, so you can't use Edit > Undo on the menus.

removedupes supports this, with the mechanism of marking *Originals Folders*: 

1. Select a set of folders containing originals
2. On the menus, choose Tools > Set original message folders for next duplicate search (you can try the context menu, but see issue #305)
3. Select a set of (root) folders to search for duplicates
4. On the menus, choose Tools > Remove Duplicates... (you can try the context menu, but see issue #305)

the search procedure is similar to the usual ones, with comparison criteria and the review dialog, but: Sets of messages will be deemed relevant  dupes only if at least one of them is in an "Originals" folder, and at least one of them is in a search folder.

*Notes*: 

* When you select dupe search folders, the extension defaults to also recursing their subfolders (and sub-subfolders etc.) ; but the folders with originals are _not_ recursed, so you have fine-grain control over them.
* It is possible for a folder to be both an Originals folder and a search folder. Be careful with your choice and in your review of results.


## <a name="credits">Credits</a>

Thanks goes out to:

*   The tireless translators of the [BabelZilla](http://www.babelzilla.org/) project - while it was active.
*   alta88 (who prefers his relative anonymity) for QA help.
*   The denizens of [#mozilla.de@moznet](irc://irc.mozilla.org/%23mozilla.de) for some help with the German localization.
*   A good number of casual users who patiently and informatively reported bugs, or translation improvement suggestions.

Special thanks to Moritz Abraham who was kind enough to delist his own rudimentary dupe removal extension in favor of this extension.


## Bugs, suggestions, feedback

### "Is the extension compatible with my version of Thunderbird?"

Thunderbird has been changing dramatically in recent years, and thuse different versions of the extension are compatible with different ranges of Thunderbird versions. At any given time, the latest release of the ectension _should_ be compatible with the latest release of Thunderbird; but as released are made, allow for a short period of time before the extension is updated to be compatible with the new release.

### "The extension isn't working! What's wrong?"

Read the [FAQ section of the wiki](https://github.com/eyalroz/removedupes/wiki/FAQ-(Frequently-Asked-Questions)); your answer is probably in there.

### I have a specific bug, issue, question or feature request

Please search the [issues page](https://github.com/eyalroz/removedupes/issues) of this repository, to check if it's already been reported. If not, file a new issue. If you'd like to tell me (the author) something about the extension and/or the state of Thunderbird in general - you can [write me](mailto:eyalroz1@gmx.com).

