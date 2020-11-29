const request = require('request');
const querystring = require('querystring');
const urlRegexSafe = require('url-regex-safe');

const OpenDirectoryDownloader = require(`./open-directory-downloader`);

const odd = new OpenDirectoryDownloader();

module.exports.scanUrls = async function scanUrls(urls) {

  let scanResults = [];

  for (let url of urls) {

    try {
      scanResults.push(await odd.scanUrl(url));
    } catch (err) {
      console.warn(`Failed to scan OD:`, err);
    }
    
  }

  console.log(`scanResults:`, scanResults);

  return scanResults;
  
}

module.exports.extractUrls = function extractUrls(submission) {

  if (!submission.is_self) {

    return [submission.url];
    
  } else {

    let matches = submission.selftext.match(urlRegexSafe({
      strict: true,
      exact: false,
      ipv4: true,
      ipv6: true,
      localhost: false,
      parens: false, // don't include markdown's trainling parentheses in URL 
    }));

    return matches;

  }
  
}

module.exports.submitScanResults = function submitScanResults(scanResults) {

  console.log(`process.env.ODCRAWLER_DISCOVERY_ENDPOINT:`, process.env.ODCRAWLER_DISCOVERY_ENDPOINT);

  return;
  
}