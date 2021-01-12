const fs = require(`fs`);
const markdownLinkExtractor = require('markdown-link-extractor');
const fetch = require(`node-fetch`);
const FormData = require(`form-data`);

const OpenDirectoryDownloader = require(`./open-directory-downloader`);

const odd = new OpenDirectoryDownloader();

module.exports.scanUrls = async function scanUrls(urls) {

  let scanResults = [];

  for (let url of urls) {

    try {
      scanResults.push(await odd.scanUrl(url, true));
    } catch (err) {
      console.warn(`Failed to scan OD:`, err);
    }
    
  }

  scanResults.forEach(result => uploadScan(result.scanFile));

  console.log(`scanResults:`, scanResults);

  return scanResults;
  
}

module.exports.urlsFromText = function urlsFromText(text) {

  // return matches = text.match(urlRegexSafe({
  //   strict: true,
  //   exact: false,
  //   ipv4: true,
  //   ipv6: true,
  //   localhost: false,
  //   parens: false, // don't include markdown's trainling parentheses in URL 
  // }))

  return markdownLinkExtractor(text);
  
}

module.exports.extractUrls = async function extractUrls(submissionOrComment, isComment = false) {

  let matches;
  
  if (isComment) {

    matches = module.exports.urlsFromText(submissionOrComment.body);
  
  } else {

    if (!(await submissionOrComment.is_self)) {
  
      matches = [await submissionOrComment.url];
      
    } else {
  
      let submissionText = await (submissionOrComment.selftext);
      
      matches = module.exports.urlsFromText(submissionText);
  
    }
    
  }
  
  return matches;
  
}

module.exports.submitScanResults = function submitScanResults(scanResults) {

  console.log(`process.env.ODCRAWLER_DISCOVERY_ENDPOINT:`, process.env.ODCRAWLER_DISCOVERY_ENDPOINT);

  return;
  
}

async function uploadScan(scanFile) {

  const form = new FormData();
  form.append(`file`, fs.createReadStream(scanFile))
  
  let res = await fetch(`${process.env.ODCRAWLER_DISCOVERY_ENDPOINT}/upload`, {
    method: `POST`,
    headers: {
      Authorization: 'Basic ' + Buffer.from(process.env.ODCRAWLER_DISCOVERY_UPLOAD_USERNAME + ":" + process.env.ODCRAWLER_DISCOVERY_UPLOAD_PASSWORD).toString('base64'),
    },
    body: form,
  });

  let jsonResponse;
  try {
    jsonResponse = await res.json();
  } catch (err) {
    console.error(`Failed to upload scan to discovery server:`, err);
  }

  if (res.ok && jsonResponse.ok) {
    console.log(`Scan uploaded successfully! Path: ${jsonResponse.path}`);
  }

}