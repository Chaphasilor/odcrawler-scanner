require('dotenv').config();
const betterLogging = require(`better-logging`)
betterLogging(console, {
  messageConstructionStrategy: betterLogging.MessageConstructionStrategy.FIRST,
})
console.logLevel = process.env.environment === `development` ? 4 : 3
const Bot = require('./bot');
const { getUrl, sleep, checkDiscoveryServerReachable } = require('./util');

(async () => {

  let praises = [
    'good bot',
    'good bot!',
    'goodbot',
    'goodbot!',
  ];

  let toScrape;
  let blacklistedUsers;
  let staleTimeout;

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

  try {
    staleTimeout = JSON.parse(process.env.REDDIT_CONSIDER_INVOCATION_STALE);
  } catch (err) {
    console.error('failed to load stale timeout from environment variable!');
    staleTimeout = 3600;
  }

  let clientOptions = {
    userAgent: process.env.REDDIT_USER_AGENT,
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USER,
    password: process.env.REDDIT_PASS,
  };


  const redditBot = new Bot(toScrape, praises, clientOptions, blacklistedUsers, staleTimeout);

  try {

    redditBot.startPolling({
      submissionsIntervall: process.env.REDDIT_POLLING_SUBMISSIONS,
      inboxIntervall: process.env.REDDIT_POLLING_INBOX,
      mentionsIntervall: process.env.REDDIT_POLLING_MENTIONS,
    });

    console.info(`Bot is now running!`);

  } catch (err) {
    console.error(`Couldn't start the bot: ${err}`);
  }

})();

checkDiscoveryServerReachable()