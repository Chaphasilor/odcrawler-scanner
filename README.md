# ODScanner

A reddit bot that is able to scan submissions to /r/OpenDirectories for URLs and scan them using [KoalaBear84/OpenDirectoryDownloader](https://github.com/KoalaBear84/OpenDirectoryDownloader).

## *How does it work?*

The bot can be invoked by mentioning its Reddit user name (/u/ODScanner) inside a comment in the comment section of any post on /r/OpenDirectories.  

- Mentions inside of the submission text or title itself are not possible, due to Reddit not notifying the user's account in that case.  
- Mentions can also include any additional text; the text will be ignored by the bot.  
  **An important exception to this are URLs (links):** If you provide one or more URLs *anywhere* in the mention, those URLs, and *only* those, will be scanned instead of the URLs found in the submission.  
  This is useful in case a subdirectory was linked in the submission, but you want the bot to scan the parent directory, which is always appreciated.  
The feature can also be used to exclude some URLs from scan, especially those that aren't actual Open Directories (ODs).
- The bot tries to exclude URLs which don't link to actual ODs by default, but so far this isn't very reliable.

## *What happens afterwards?*

- The scan results will be posted as a reply to the invoking comment and include basic stats about the Open Directory:
  - The amount of detected files and their total size
  - The top 5 extensions
  - A speed test
  - A link to a text file containing all URLs found inside the directory
- All scan results are also uploaded to the [ODCrawler discovery server](https://github.com/MCOfficer/odcrawler-discovery) and will be indexed for search, so that they eventually can be searched using [ODCrawler](https://odcrawler.xyz).

## Documentation & Contributing

Contributions are always welcome and very appreciated! :)  
Be it in the form of issues, bug fixes or ideas for new features, just let me know about it!

### Getting started

In order to run the bot you need all of the following:

- Node.js 14 or higher, as well as `npm`, installed
- The source code from this repository, duh.
- A Reddit account that is older than two weeks and has enough karma to comment in the subreddits you want it to monitor.  
  You'll need some credentials from the account, it's all explained below.
- A valid `.env` file (or properly set environment variables).  
  See below for more info about the required variables.

Once you have all that, you can run `npm install` (to install all the needed dependencies) and afterwards `npm start` to actually start the bot!

### Setting up the Reddit account

In theory you can use any Reddit account, however be sure to mind Reddit's rules at all times.  
The most relevant rule is that bot accounts should be marked as such, on site as well as in the user agent header.  
This means that you should not simply use your personal account to run the bot. You can do this for testing purposes, but only if it happens in a private subreddit.  
(Be also sure to always keep in mind which account you're logged in with at any given time, because bot accounts should **not** vote on Reddit. *Please* switch accounts before voting, even if it's a hassle.)

Keep in mind that the account has to be at least two weeks old and have a bit of karma, or it won't be able to comment!

1. Go to https://www.reddit.com/prefs/apps
2. Scroll down to the bottom of the page and click on 'create (another) app...'
3. Select 'script' from the radio menu
4. Give it a name and set at least the 'about url' to this repository or your fork of it
5. Click on 'create app'
6. Copy the client ID from the line below 'personal use script'
7. Copy the client secret. You might have to click on 'edit' first

### Setting up the `.env` file

The `.env` has to be included in the root directory of the bot source code (the same directory where `package.json` is located).  
There are many different environment variables than can be used to customize how the bot behaves:

- `REDDIT_USER_AGENT`: the user agent used by the bot when communicating with the Reddit API. Should be `NodeJS:ODCrawler Scanner Bot:<version> (by /u/<your personal account's Reddit username>)`
- `REDDIT_CLIENT_ID`: the client ID from [Setting up the Reddit account](#setting-up-the-reddit-account). Looks something like `ag-ksuaJNiaHt`
- `REDDIT_CLIENT_SECRET`: the client secret from [Setting up the Reddit account](#setting-up-the-reddit-account). Looks something like `=HnalihpdtaUsnalUngls_jIauenslt`
- `REDDIT_USER`: the user name of the bot's Reddit account, e.g. `ODScanner` for my instance of the bot
- `REDDIT_PASS`: the password for the bot's Reddit account
- `REDDIT_POLLING_MENTIONS`: how often the bot should check for new username mentions, in seconds. Recommended: `120`
- `REDDIT_POLLING_QUEUE`: how often the bot should check for pending scans, in seconds. Recommended: `15`
- `REDDIT_SUBS_TO_SCRAPE`: a JSON object for specifying with subs the bot should be monitoring with three keys: `new`, `rising` and `hot`, each being an array of subreddits. Example: `{"new": ["opendirectories", "testingground4bots"], "rising": [], "hot": [] }`.  
  As of right now there's no difference between the three keys, all of the subs will be monitored.
- `REDDIT_CONSIDER_INVOCATION_STALE`: the time after a username mention should not invoke a scan anymore, in seconds. Recommended: `36000`  
  This stale timeout is only used for "new" mentions that the bot hasn't seen before, e.g. after a restart.
- `DOMAINS_EXCLUDED_FROM_SCANNING`: and array of domains which will be ignored when the bot scans the invoking comment for user-supplied URLs. Recommended: `["reddit.com", "www.reddit.com", "preview.redd.it", "imgur.com", "i.imgur.com", "youtube.com", "youtu.be", "www.koalabear.nl", "koalabear.nl", "github.com", "open-directory-downloader.herokuapp.com"]`
- `DB_FILE_PATH`: the relative path to an *existing* JSON file containing just `[]`, e.g. `db.json`  
  This file is used to store information about performed scans for further processing.

The environment variables below are optional and only needed for integrating with [ODCrawler](https://odcrawler.xyz).  
**If you don't want to have the bot upload the scan results to ODCrawler, you'll need to set `ODCRAWLER_DISCOVERY_UPLOAD_FREQUENCY` to `-1`.**

- `ODCRAWLER_DISCOVERY_ENDPOINT`: the upload endpoint which accepts a `POST` request with the compressed [OpenDirectoryDownloader](https://github.com/KoalaBear84/OpenDirectoryDownloader) scan result file. Recommended: `https://discovery.odcrawler.xyz`
- `ODCRAWLER_DISCOVERY_UPLOAD_USERNAME`: the username used for authenticating with the upload endpoint. Please contact me privately in order to get one.
- `ODCRAWLER_DISCOVERY_UPLOAD_PASSWORD`: the password used for authenticating with the upload endpoint. Please contact me privately in order to get one.
- `ODCRAWLER_DISCOVERY_UPLOAD_FREQUENCY`: how often to check if there are scan results to upload and attempting to upload them. Set to `-1` to disable the ODCrawler integration. Recommended: `1800`  
  This also affects how long the bot will wait until trying again after an upload error.

### Hosting an instance of the bot

In theory there is no need to host another instance of the bot. I'm hosting and maintaining the main instance, which powers [/u/ODScanner](https://reddit.com/u/ODScanenr), myself and will hopefully continue to do so for some time.  
If however, for whatever reason, you decide a second instance would be beneficial (competition is good, after all), I would appreciate if you could let me know beforehand. Having two bots running that do the exact same thing not only goes against Reddit's [Bottiquette](https://www.reddit.com/r/Bottiquette/wiki/bottiquette) but is also pretty pointless and more likely to annoy users instead of helping.  
Your instance should offer benefits of some sort.

You could either self-host the bot or use an online service like Heroku or Digital Ocean, but keep in mind that the free tiers of those online services isn't suited for the bot. It needs to keep running at all times and needs access to the file system in order to work.  
A fast internet connection would also be beneficial, so as to not bottleneck the OD speed tests.

### How to Contribute

As already stated, I appreciate contributions of any form!  
Anything that helps the bot get better (more stable, more features, faster) is something I'd be interested in.

Here are some guidelines on how to contribute:

- Read the README :D
- Before creating an issue, see if there are other issues similar to yours already
- Before submitting or even working on a larger pull request, create an issue describing *what* you want to do and *why*
- When modifying the source code, try to use a coding style that's more or less consistent with my style.  
  **Please** don't use a formatter like Prettier, I like the way my code looks :)
- Try not to refactor code if it can be avoided. Refactoring always bears the risk of breaking some edge cases, and these edge cases are difficult to test
- Test your pull request before submitting *and* provide an example for testing your additions

Looking forward to hearing from you!
