const fs = require(`fs`);
const { createGzip } = require('zlib');
const pipe = require(`util`).promisify(require(`stream`).pipeline);
const markdownLinkExtractor = require('markdown-link-extractor');
const fetch = require(`node-fetch`);
const FormData = require(`form-data`);

const OpenDirectoryDownloader = require(`open-directory-downloader`);

const odd = new OpenDirectoryDownloader();

module.exports.scanUrls = async function scanUrls(urls) {

  let scanResults = {
    successful: [],
    failed: [],
  };

  for (let url of urls) {

    console.info(`Starting scan of '${url}'...`)
    try {
      scanResults.successful.push(await odd.scanUrl(url, {
        keepJsonFile: true,
        performSpeedtest: true,
        uploadUrlFile: true,
      }));
    } catch (err) {
      console.warn(`Failed to scan '${url}':`, err);
      scanResults.failed.push({
        url,
        reason: err.message,
      })
    }
    
  }

  scanResults.successful.forEach(result => saveScanResults(result.jsonFile, result.scannedUrl));

  console.log(`scanResults:`, scanResults);

  if (scanResults.successful.length <= 0 && urls.length > 0) {
    throw new Error(`OpenDirectoryDownloader couldn't scan any of the provided ODs`)
  }

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

  const excludedDomains = JSON.parse(process.env.DOMAINS_EXCLUDED_FROM_SCANNING)

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

  matches = matches.filter(url => {
    return !excludedDomains.includes(new URL(url).hostname)
  })
  
  return matches;
  
}

async function saveScanResults(scanPath, scannedUrl) {

  let fileToUpload
  try {
    
    fileToUpload = await compressFile(scanPath)
    if (scanPath !== fileToUpload) {
      fs.unlinkSync(scanPath)
    }
    
  } catch (err) {

    console.warn(`Couldn't compress file '${scanPath}':`, err)
    fileToUpload = scanPath

  }

  try {

    let db = JSON.parse(fs.readFileSync(process.env.DB_FILE_PATH, {
      encoding: `utf-8`,
    }))

    db.push({
      scannedUrl,
      pathToScanFile: fileToUpload,
    })

    fs.writeFileSync(process.env.DB_FILE_PATH, JSON.stringify(db))

    console.log(`Saved scan result to db file`)
    
  } catch (err) {
    console.error(`Error while saving scan results to db file:`, err);
  }
  
}

async function checkDiscoveryServerReachable() {

  while (true) {

    console.debug(`Checking if discovery server is reachable...`);

    let res = await fetch(process.env.ODCRAWLER_DISCOVERY_ENDPOINT, {
      method: `head`,
    })
  
    if (res.ok) {

      console.debug(`Discovery server is online!`);
      await tryToUploadScansFromDB()

    } else {
      console.warn(`Discovery server appears to be offline.`);
    }
  
    let sleepMinutes = Number(process.env.ODCRAWLER_DISCOVERY_UPLOAD_FREQUENCY)

    console.debug(`Waiting ${sleepMinutes} minute${sleepMinutes > 1 ? `s` : ``} before trying again`)
    await sleep(sleepMinutes*60*1000)

  }
  
}
module.exports.checkDiscoveryServerReachable = checkDiscoveryServerReachable

async function tryToUploadScansFromDB() {

  console.debug(`Trying to upload saved scans to the discovery server...`)
  
  try {
    
    let db = JSON.parse(fs.readFileSync(process.env.DB_FILE_PATH, {
      encoding: `utf-8`,
    }))

    let failed = []

    if (db.length == 0) {
      console.debug(`No scans left to upload!`)
      return
    }
    
    for (const scanResult of db) {

      try {
        
        if (fs.existsSync(scanResult.pathToScanFile)) {

          await uploadScan(scanResult.pathToScanFile)
          fs.unlinkSync(scanResult.pathToScanFile)
          console.log(`Scan file deleted!`)

        } else {
          console.warn(`Scan file doesn't exist anymore, removing from DB...`)
        }
        
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
    timeout: 0,
    compress: true,
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

/**
 * Compresses a file using gzip
 * @param {String} input The path to the input file
 * @param {String} [output] The path to the output file. Can't exist yet.
 * @returns {String} The path to the output file
 */
async function compressFile(input, output) {
  
  const outputName = output || `${input}.gz`;
  const gzip = createGzip();
  const source = fs.createReadStream(input);
  const destination = fs.createWriteStream(outputName);
  await pipe(source, gzip, destination);

  return outputName
  
}

function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  })
}
module.exports.sleep = sleep
