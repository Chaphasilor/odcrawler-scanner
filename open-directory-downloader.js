const { rejects } = require('assert');
const { spawn } = require('child_process');
const fs = require(`fs`);
const { resolve } = require('path');

module.exports = class OpenDirectoryDownloader {

  constructor() {

    this.executable = process.env.OPEN_DIRECTORY_DOWNLOADER_PATH;
    this.outputDir = process.env.OPEN_DIRECTORY_DOWNLOADER_OUTPUT_DIR;
    
  }

  scanUrl(url) {
    return new Promise((resolve, reject) => {
    
      const oddProcess = spawn(this.executable, [`-u ${url}`, `--quit`, `--json`, `--upload-urls`]);

      let output = ``;
      let error = ``;
      
      oddProcess.stdout.on('data', (data) => {
        // console.log(`stdout: ${data}`);
        output += data;
      });
      
      oddProcess.stderr.on('data', (data) => {
        console.warn(`Error from ODD: ${data}`);
        error += data;
      });
      
      oddProcess.on('close', (code) => {

        if (code !== 1) {
          reject(new Error(`ODD exited with code ${code}: ${error}`));
        }

        const redditOutputStartString = `|`;
        const redditOutputEndString = `^(Created by [KoalaBear84's OpenDirectory Indexer](https://github.com/KoalaBear84/OpenDirectoryDownloader/))`;
        const credits = `^(Created by [KoalaBear84's OpenDirectory Indexer](https://github.com/KoalaBear84/OpenDirectoryDownloader/))`;
        
        let redditOutput = `${redditOutputStartString}${output.split(redditOutputStartString).slice(1).join(redditOutputStartString)}`.split(redditOutputEndString).slice(0, -1).join(redditOutputEndString);

        let jsonFile = output.match(/Saved\ session:\ (.*)/)[1]; // get first capturing group. /g modifier has to be missing!
        let urlFile = output.match(/Saved URL list to file:\ (.*)/)[1];
        fs.unlinkSync(`${this.outputDir}${urlFile}`);

        let results;
        try {

          results = JSON.parse(fs.readFileSync(`${this.outputDir}${jsonFile}`));
          fs.unlinkSync(`${this.outputDir}${jsonFile}`);
          
        } catch (err) {
          console.error(`err:`, err);

          resolve({
            reddit: redditOutput,
            credits,
          })
          
        }

        resolve({
          scan: results,
          reddit: redditOutput,
          credits,
        })
        
      });
    
    })
  }
  
}