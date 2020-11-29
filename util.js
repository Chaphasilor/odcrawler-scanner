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

module.exports.extractUrls = async function extractUrls(submission) {



  if (!(await submission.is_self)) {

    return [await submission.url];
    
  } else {

    let test = await (submission.selftext);
    
    let matches = test.match(urlRegexSafe({
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