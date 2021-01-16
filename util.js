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

  scanResults.forEach(result => saveScanResults(result.scanFile, result.scannedUrl));

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

function saveScanResults(scanPath, scannedUrl) {

  try {

    let db = JSON.parse(fs.readFileSync(process.env.DB_FILE_PATH, {
      encoding: `utf-8`,
    }))

    db.push({
      scannedUrl,
      pathToScanFile: scanPath,
    })

    fs.writeFileSync(process.env.DB_FILE_PATH, JSON.stringify(db))

    console.log(`Saved scan result to db file`)
    
  } catch (err) {
    console.error(`Error while saving scan results to db file:`, err);
  }
  
}

async function checkDiscoveryServerReachable() {

  while (true) {

    console.log(`Checking if discovery server is reachable...`);

    let res = await fetch(process.env.ODCRAWLER_DISCOVERY_ENDPOINT, {
      method: `head`,
    })
  
    if (res.ok) {

      console.log(`Discovery server is online!`);
      await tryToUploadScansFromDB()

    } else {
      console.log(`Discovery server appears to be offline.`);
    }
  
    let sleepMinutes = Number(process.env.ODCRAWLER_DISCOVERY_UPLOAD_FREQUENCY)

    console.log(`Waiting ${sleepMinutes} minute${sleepMinutes > 1 ? `s` : ``} before trying again`)
    await sleep(sleepMinutes*60*1000)

  }
  
}
module.exports.checkDiscoveryServerReachable = checkDiscoveryServerReachable

async function tryToUploadScansFromDB() {

  console.log(`Trying to upload saved scans to the discovery server...`)
  
  try {
    
    let db = JSON.parse(fs.readFileSync(process.env.DB_FILE_PATH, {
      encoding: `utf-8`,
    }))

    let failed = []

    if (db.length == 0) {
      console.log(`No scans left to upload!`)
      return
    }
    
    for (const scanResult of db) {

      try {
        
        await uploadScan(scanResult.pathToScanFile)
        fs.unlinkSync(scanResult.pathToScanFile)
        console.log(`Scan file deleted!`)
        
      } catch (err) {

        console.error(`Error while uploading scan:`, err)
        failed.push(scanResult)
        
      }
      
    }

    fs.writeFileSync(process.env.DB_FILE_PATH, JSON.stringify(failed))
    
  } catch (err) {
    console.error(`Error while trying to upload scans:`, err)
  }
  
} 

async function uploadScan(scanPath) {

  console.log(`Uploading scan...`)
  
  const form = new FormData();
  form.append(`file`, fs.createReadStream(scanPath))
  
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
    throw new Error(`Failed to upload scan to discovery server: ${err}`);
  }

  if (res.ok && jsonResponse.ok) {
    console.log(`Scan uploaded successfully! Path: ${jsonResponse.path}`);
  } else {
    throw new Error(`Failed to upload scan: ${jsonResponse.error}`)
  }

}

function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  })
}
module.exports.sleep = sleep
