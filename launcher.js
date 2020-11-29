require('dotenv').config();
const Bot = require('./bot');
const { getUrl } = require('./util');
const http = require('http');

let port = process.env.PORT != undefined ? process.env.PORT : 6969;

http.createServer((req, res) => {

  res.write('Online!');
  res.end();
  
}).listen(port);

(async () => {

  let praises = [
    'good bot',
    'good bot!',
    'goodbot',
    'goodbot!',
  ];

  let toScrape;
  let blacklistedUsers;

  try {
    toScrape = JSON.parse(process.env.REDDIT_SUBS_TO_SCRAPE);
  } catch (err) {
    console.error('failed to load subs to scrape from environment variable!');
    toScrape = {new: [], rising: [], hot: []};
  }

  try {
    blacklistedUsers = JSON.parse(process.env.REDDIT_BLACKLISTED_USERS);
  } catch (err) {
    console.error('failed to load blacklisted users from environment variable!');
    blacklistedUsers = [];
  }

  let clientOptions = {
    userAgent: process.env.REDDIT_USER_AGENT,
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USER,
    password: process.env.REDDIT_PASS,
  };


  const redditBot = new Bot(toScrape, praises, clientOptions, blacklistedUsers);

  try {

    redditBot.startPolling({
      submissionsIntervall: process.env.REDDIT_POLLING_SUBMISSIONS,
      inboxIntervall: process.env.REDDIT_POLLING_INBOX,
      mentionsIntervall: process.env.REDDIT_POLLING_MENTIONS,
    });

  } catch (err) {
    console.error(`Couldn't start the bot: ${err}`);
  }

})();

function sleep(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  })
}
