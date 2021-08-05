const fs = require(`fs/promises`);
const fsLegacy = require(`fs`)
const { createGzip } = require('zlib');
const pipe = require(`util`).promisify(require(`stream`).pipeline);
const markdownLinkExtractor = require('markdown-link-extractor');
const fetch = require(`node-fetch`);
const FormData = require(`form-data`);
const odd = require(`open-directory-downloader`);
const isLocal = require(`is-local-ip`)

const { ScanError } = require(`./errors`)

const indexer = new odd.OpenDirectoryDownloader({
  maximumMemory: (!isNaN(Number(process.env.ODD_MAXIMUM_MEMORY)) && Number(process.env.ODD_MAXIMUM_MEMORY) > 0) ? Number(process.env.ODD_MAXIMUM_MEMORY) : undefined
});

module.exports.scanUrls = async function scanUrls(urls) {

  let scanResults = {
    successful: [],
    failed: [],
  };

  for (let url of urls) {

    if (isLocalIP(url)) {

      scanResults.failed.push({
        url,
        reason: `Scans of local IPs or TLD-less domains are not possible`,
        missingFileSizes: false,
      })

      continue
    }

    console.info(`Starting scan of '${url}'...`)
    try {

      const scanOptions = {
        keepJsonFile: true,
        performSpeedtest: true,
        uploadUrlFile: true,
        fastScan: true,
        threads: 4,
        timeout: 30,
      }
      
      let result = await indexer.scanUrl(url, scanOptions)

      // if a full scan is required and there aren't too many files, do it immediately before replying with scan results
      if (result.missingFileSizes && result.stats?.totalFiles < (Number(process.env.ODD_MAX_FILES_SLOW_SCAN) || -1)) {
        console.info(`Missing file sizes for "${url}" (small OD), doing a full scan!`)
        await fs.unlink(result.jsonFile)
        scanOptions.fastScan = false //!!!
        result = await indexer.scanUrl(url, scanOptions)
      }
      
      scanResults.successful.push(result);

      saveScanResults(result.jsonFile, result.scannedUrl);

    } catch (err) {
      console.warn(`Failed to scan '${url}':`, err);

      let reason = ``

      if (err[0] instanceof odd.ODDError) {
        reason = err[0].message
      } else if (err[0] instanceof odd.ODDOutOfMemoryError) {
        reason = `Scanner ran out of memory`
      } else {
        reason = `Internal Error`
      }
      
      scanResults.failed.push({
        url,
        reason: err[0] instanceof odd.ODDError ? err[0].message : `Internal Error`, // TODO once Google Drive errors are supported in `open-directory-downloader`, detect them (via string matching) and provide an appropriate error message
        reddit: err[1]?.reddit,
        missingFileSizes: err[1]?.missingFileSizes
      })
    }
    
  }

  console.debug(`scanResults:`, scanResults);

  if (scanResults.successful.length === 0 && urls.length > 0) {
    throw new ScanError(scanResults.failed.length === 1 ? scanResults.failed[0].reason : `Couldn't scan any of the provided ODs`)
  }

  if (scanResults.successful.length === 0 && urls.length > 0) {
    throw new Error(scanResults.failed.length === 1 ? scanResults.failed[0].reason : `Couldn't scan any of the provided ODs`)
  }

  return scanResults;
  
}

function isLocalIP(url) {

  try {

    const parsedUrl = new URL(url)
    
    return isLocal(parsedUrl.hostname) || !parsedUrl.hostname.includes(`.`)
    
  } catch (err) {
    return false
  }
  
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

  // filter out duplicate URLs as well as URLs from excluded domains
  let filteredUrls = []
  for (const url of matches) {
    if (
      !filteredUrls.some(x => x === url) &&
      !excludedDomains.includes(new URL(url).hostname)
      ) {
      filteredUrls.push(url)
    }
  }
  
  return filteredUrls;
  
}

async function saveScanResults(scanPath, scannedUrl) {

  let fileToUpload
  try {
    
    fileToUpload = await compressFile(scanPath)
    if (scanPath !== fileToUpload) {
      await fs.unlink(scanPath)
    }
    
  } catch (err) {

    console.warn(`Couldn't compress file '${scanPath}':`, err)
    fileToUpload = scanPath

  }

  try {

    let db = JSON.parse(await fs.readFile(process.env.DB_FILE_PATH, {
      encoding: `utf-8`,
    }))

    db.push({
      scannedUrl,
      pathToScanFile: fileToUpload,
    })

    await fs.writeFile(process.env.DB_FILE_PATH, JSON.stringify(db))

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

    console.debug(`Waiting ${sleepMinutes} second${sleepMinutes > 1 ? `s` : ``} before trying again`)
    await sleep(sleepMinutes*1000)

  }
  
}
module.exports.checkDiscoveryServerReachable = checkDiscoveryServerReachable

async function tryToUploadScansFromDB() {

  console.debug(`Trying to upload saved scans to the discovery server...`)
  
  try {
    
    let db = JSON.parse(await fs.readFile(process.env.DB_FILE_PATH, {
      encoding: `utf-8`,
    }))

    let failed = []

    if (db.length == 0) {
      console.debug(`No scans left to upload!`)
      return
    }
    
    for (const scanResult of db) {

      try {
        
        try {

          await fs.access(scanResult.pathToScanFile)

          await uploadScan(scanResult.pathToScanFile)
          await fs.unlink(scanResult.pathToScanFile)
          console.log(`Scan file deleted!`)

        } catch (err) {
          console.warn(`Scan file doesn't exist anymore, removing from DB...`)
        }
        
      } catch (err) {

        console.error(`Error while uploading scan:`, err)
        failed.push(scanResult)
        
      }
      
    }

    await fs.writeFile(process.env.DB_FILE_PATH, JSON.stringify(failed))
    
  } catch (err) {
    console.error(`Error while trying to upload scans:`, err)
  }
  
} 

async function uploadScan(scanPath) {

  console.log(`Uploading scan...`)
  
  const form = new FormData();
  form.append(`file`, fsLegacy.createReadStream(scanPath))
  
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
  const source = fsLegacy.createReadStream(input);
  const destination = fsLegacy.createWriteStream(outputName);
  await pipe(source, gzip, destination);

  return outputName
  
}

function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  })
}
module.exports.sleep = sleep
