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

Contributions are always welcome and very appreciated! :)
