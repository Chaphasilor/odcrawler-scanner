const Snoowrap = require('snoowrap');
const qs = require('querystring');
const request = require('request');
const { scanUrls, extractUrls, submitScanResults } = require('./util');

module.exports = class Bot {

  constructor(toScrape, praises, clientOptions, blacklistedUsers) {

    this.BOT_START = Date.now() / 1000;
    this.MONTHS_TO_MAINTAIN = process.env.REDDIT_MONTHS_TO_MAINTAIN || 1;
    this.oldIds = [];
    this.toScrape = toScrape;
    this.praises = praises;
    this.blacklistedUsers = blacklistedUsers;
    this.client = new Snoowrap(clientOptions);
    this.username = clientOptions.username;
    this.devLink = 'https://www.reddit.com/message/compose?to=Chaphasilor&subject=[DEV]';
    this.feedbackLink = 'https://www.reddit.com/message/compose?to=Chaphasilor&subject=[FEEDBACK]';
    this.running = {
      refreshSubmissions: false,
      checkInbox: false,
      checkForMentions: false,
    }

  }

  startPolling({ submissionsIntervall, inboxIntervall, brokenLinksIntervall }) {

    if (submissionsIntervall > 0) {
      this.pollSubmissions(submissionsIntervall);
    }
    if (inboxIntervall > 0) {
      this.pollInbox(inboxIntervall);
    }
    if (brokenLinksIntervall > 0) {
      this.pollMentions(brokenLinksIntervall);
    }

  }

  pollSubmissions(seconds) {
    this.refreshSubmissions();
    setInterval(() => {
      if (!this.running.refreshSubmissions) {
        this.refreshSubmissions();
      }
    }, seconds * 1000);
  }

  pollInbox(seconds) {
    this.checkInbox();
    setInterval(() => {
      if (!this.running.checkInbox) {
        this.checkInbox();
      }
    }, seconds * 1000);
  }

  pollMentions(seconds) {
    this.checkForMentions();
    setInterval(() => {
      if (!this.running.checkForMentions) {
        this.checkForMentions();
      }
    }, seconds * 1000);
  }

  async alreadyCommentedSubmission(submission) {
    try {
      submission.comments = await submission.comments.fetchAll();
      if (submission.comments.length > 0) {
        return submission.comments.reduce((ret, curr) => {
          return ret || curr.author.name == this.username;
        }, false);
      } else {
        throw 'No comments found';
      }
    } catch (err) {
      return false;
    }
  }

  async alreadyCommentedComment(comment) {
    try {
      // comment.replies = await comment.replies.fetchAll();
      comment = await comment.expandReplies(Infinity);
      if (comment.replies.length > 0) {
        return comment.replies.reduce((ret, curr) => {
          return ret || curr.author.name == this.username;
        }, false);
      } else {
        throw 'No comments found';
      }
    } catch (err) {
      console.log('err:', err);
      return false;
    }
  }

  generateComment(scanResults, devLink, feedbackLink) {

    let tables = scanResults.reduce((tableString, cur)=> {
      return `${tableString}\n${cur.reddit}`;
    }, ``);

    return `
Here are the scan results:  

${tables}  
${scanResults[0].credits}

I'm a bot, beep, boop!

^([Contact Developer](${devLink}) | [Give Feedback](${feedbackLink}))
    `;

  }

  async refreshSubmissions() {

    console.log('refreshing submissions...');
    this.running.refreshSubmissions = true;

    let count = 0;

    try {
      let allSubmissions = [];

      for (let type of Object.keys(this.toScrape)) {

        for (let subredditName of this.toScrape[type]) {
          let subs;
          let sub = await this.client.getSubreddit(subredditName);
          switch (type) {
            case 'new':
              subs = await sub.getNew({ limit: 10 });
              break;

            case 'rising':
              subs = await sub.getRising({ limit: 10 });
              break;

            case 'hot':
              subs = await sub.getHot({ limit: 10 });
              break;

            default:
              break;
          }
          // console.log(subs);
          allSubmissions = allSubmissions.concat(subs);
        }

      }

      // console.log(allSubmissions);

      // filter out all duplicates
      let filteredSubmissionIds = [];

      allSubmissions = allSubmissions.filter(submission => {
        if (!filteredSubmissionIds.includes(submission.id)) {
          filteredSubmissionIds.push(submission.id);
          return true;
        } else {
          return false;
        }
      })

      // only include submissions that are younger than 5 days
      allSubmissions = allSubmissions.filter(submission => {
        let fiveDaysAgo = (Date.now() - 1000*60*60*24*5) / 1000; // created_utc is in seconds, not milliseconds
        return submission.created_utc >= fiveDaysAgo;
      })

      // filter posts by blacklisted users
      allSubmissions = allSubmissions.filter(submission => {
        return !this.blacklistedUsers.includes(submission.author.name);
      })
      
      // only include new submissions (not dealt with by the bot)
      allSubmissions = allSubmissions.filter(submission => {
        return !this.oldIds.includes(submission.id);
      })
      // remember all new submissions
      allSubmissions.forEach(submission => {
        this.oldIds.push(submission.id);
      })

      console.log(`allSubmissions.length:`, allSubmissions.length);
      
      console.log(`allSubmissions.length:`, allSubmissions.length);

      for (let submission of allSubmissions) {

        if (!(await this.alreadyCommentedSubmission(submission))) {

          console.log(`replying to '${submission.title}' (https://reddit.com/${submission.id})`);

          let odUrls = extractUrls(submission);

          console.log(`odUrls:`, odUrls);

          let scanResults;
          try {

            scanResults = await scanUrls(odUrls);

            let reply;
            
            if (scanResults.length === 0) {
              reply = await submission.reply(`
Sorry, I didn't manage to scan this OD :/
              `);
            } else {

              let reply = await submission.reply(this.generateComment(scanResults, this.devLink, this.feedbackLink));

              console.log('replied to submission', submission.title);
              count++;

              // search the subreddit's mods for the bots user name
              let sub = await this.client.getSubreddit(reply.subreddit.display_name);
              let mod = await sub.getModerators({ name: this.username });

              // approve reply if bot is a moderator with posts permission
              if (mod.length > 0 && mod[0].mod_permissions.includes('posts')) {
                await reply.approve();
                console.log('approved comment');
              }
              
            }

          } catch (err) {
            console.error(`error replying to ${submission.id}: ${err}`);
          }

        } else {
          // console.log('Already commented on ', submission.title);
        }

      }

      this.running.refreshSubmissions = false;
      console.log(`successfully refreshed submissions, replied to ${count} posts`);

    } catch (error) {
      this.running.refreshSubmissions = false;
      console.error('Error while fetching new submissions:', error.message);
    }

  }

  async checkInbox() {

    console.log('checking inbox...');
    this.running.checkInbox = true;
    let success = 0;
    let failed = 0;

    try {

      const messages = await this.client.getInbox();
      // console.log('messages:', messages);

      // filter only actual comment replies which the bot didn't already comment on
      let comments = messages.filter(async message => await message.was_comment == true)

      // console.log('comments:', comments);

      let praisingComments = comments.filter(comment => this.praises.includes(comment.body.toLowerCase()));

      // console.log('praisingComments:', praisingComments);

      let unrepliedComments = [];

      for (let comment of praisingComments) {
        if (!(await this.alreadyCommentedComment(comment))) {
          unrepliedComments.push(comment);
        } else {
          // console.log(`already replied...`);
        }
      }

      // console.log('unrepliedComments:', unrepliedComments);

      for (let comment of unrepliedComments) {
        try {
          console.log(`replying to praising comment ${comment.body} from /u/${comment.author.name}`);
          let newComment = await comment.reply('Thanks ;)');
          console.log(`reply sent, comment id ${newComment.id}`);
          success++;
        } catch (error) {
          console.error(`error replying to comment with id ${comment.id} from /u/${comment.author.name}:`, error);
          failed++;
        }
      }

      this.running.checkInbox = false;
      console.log(`successfully checked inbox, success: ${success}, failed: ${failed}`);

    } catch (err) {

      this.running.checkInbox = false;
      console.error(`an error occured checking the inbox: ${err}`);
    }

  }

  async checkForMentions() {

    console.log('checking inbox for mentions...');
    this.running.checkInbox = true;
    let success = 0;
    let failed = 0;

    try {

      const mentions = await this.client.getInbox({
        filter: `mentions`
      });

      console.log(`mentions:`, mentions);

      this.running.checkInbox = false;
      console.log(`successfully checked for mentions, success: ${success}, failed: ${failed}`);

    } catch (err) {

      this.running.checkInbox = false;
      console.error(`an error occured checking for mentions: ${err}`);
    }

  }

  async updateLink(comment, scanResults) {

    let submission = await this.client.getSubmission(comment.parent_id);
    submission.url = await submission.url;
    submission.id = await submission.id;

    await comment.edit(this.generateComment(scanResults, this.devLink, this.feedbackLink));
    console.log('updated link on ', 'https://reddit.com/' + submission.id);

  }

}