const Snoowrap = require('snoowrap');
const qs = require('querystring');
const request = require('request');
const { scanUrls, extractUrls, submitScanResults, FiniteArray } = require('./util');

module.exports = class Bot {

  constructor(toScrape, praises, clientOptions, blacklistedUsers, staleTimeout) {

    this.BOT_START = Date.now() / 1000;
    //TODO limit array size!!!
    this.oldSubmissions = [];
    this.oldMentions = [];
    this.toScrape = toScrape;
    this.praises = praises;
    this.blacklistedUsers = blacklistedUsers;
    this.invokationsStaleTimeout = staleTimeout;
    this.client = new Snoowrap(clientOptions);
    this.username = clientOptions.username;
    this.subsToMonitor = Object.values(this.toScrape).reduce((allSubs, sorting) => [...allSubs, ...sorting], []);
    this.devLink = 'https://www.reddit.com/message/compose?to=Chaphasilor&subject=[DEV]';
    this.feedbackLink = 'https://www.reddit.com/message/compose?to=Chaphasilor&subject=[FEEDBACK]';
    this.running = {
      refreshSubmissions: false,
      checkInbox: false,
      checkForMentions: false,
    }

  }

  startPolling({ submissionsIntervall, inboxIntervall, mentionsIntervall }) {

    if (submissionsIntervall > 0) {
      this.pollSubmissions(submissionsIntervall);
    }
    if (inboxIntervall > 0) {
      this.pollInbox(inboxIntervall);
    }
    if (mentionsIntervall > 0) {
      this.pollMentions(mentionsIntervall);
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

  async loadSubmissions() {

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

    return allSubmissions;
    
  }

  filterSubmissions(submissions) {

    // filter out all duplicates
    let filteredSubmissionIds = [];

    let filteredSubmissions = submissions.filter(submission => {
      if (!filteredSubmissionIds.includes(submission.id)) {
        filteredSubmissionIds.push(submission.id);
        return true;
      } else {
        return false;
      }
    })

    // only include submissions that are younger than 5 days
    filteredSubmissions = filteredSubmissions.filter(submission => {
      let fiveDaysAgo = (Date.now() - 1000*60*60*24*5) / 1000; // created_utc is in seconds, not milliseconds
      return submission.created_utc >= fiveDaysAgo;
    })

    // don't include hidden, removed or locked submissions
    filteredSubmissions = filteredSubmissions.filter(submission => {
      return !submission.hidden && !submission.removed && !submission.locked;
    })

    // filter posts by blacklisted users
    filteredSubmissions = filteredSubmissions.filter(submission => {
      return !this.blacklistedUsers.includes(submission.author.name);
    })
    
    // only include new submissions (not dealt with by the bot)
    filteredSubmissions = filteredSubmissions.filter(submission => {
      return !this.oldSubmissions.includes(submission.id);
    })
    // remember all new submissions
    filteredSubmissions.forEach(submission => {
      this.oldSubmissions.push(submission.id);
    })

    return filteredSubmissions;
    
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

  async scanAndComment(submission, comment) {

    submission = await submission.fetch();
    if (comment) {
      comment = await comment.fetch();
    }
    
    console.log(`scanning '${submission.title}' (https://reddit.com/${submission.id})`);

    let odUrls = await extractUrls(submission);

    console.log(`odUrls:`, odUrls);

    let scanResults;

    try {
      
      scanResults = await scanUrls(odUrls);

    } catch (err) {
      throw new Error(`error scanning OD: ${err.message}`)
    }
    
    try {

      let reply;
      
      if (scanResults.length === 0) {

        if (comment) {
          reply = await comment.reply(`
Sorry, I didn't manage to scan this OD :/
          `);
          console.log(`replied to comment https://reddit.com/comments/${submission.id}/_/${comment.id}`);
        } else {
          reply = await submission.reply(`
Sorry, I didn't manage to scan this OD :/
          `);
          console.log(`replied to '${submission.title}' (https://reddit.com/${submission.id})`);
        }
        
      } else {

        if (comment) {
          reply = await comment.reply(this.generateComment(scanResults, this.devLink, this.feedbackLink));
          console.log(`replied to comment https://reddit.com/comments/${submission.id}/_/${comment.id}`);
        } else {
          reply = await submission.reply(this.generateComment(scanResults, this.devLink, this.feedbackLink));
          console.log(`replied to '${submission.title}' (https://reddit.com/${submission.id})`);
        }


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
      throw new Error(`error replying to https://reddit.com/${submission.id}: ${err}`);
    }
    
  }

  async refreshSubmissions() {

    console.log('refreshing submissions...');
    this.running.refreshSubmissions = true;

    let count = 0;

    try {

      let allSubmissions = await this.loadSubmissions();

      let filteredSubmissions = this.filterSubmissions(allSubmissions);

      console.log(`filteredSubmissions.length:`, filteredSubmissions.length);

      for (let submission of filteredSubmissions) {

        if (!(await this.alreadyCommentedSubmission(submission))) {

          try {

            await this.scanAndComment(submission);
            count++;

          } catch (err) {
            console.error(err);
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
      let comments = messages.filter(message => message.was_comment == true)

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

    // console.log('checking inbox for mentions...');
    this.running.checkForMentions = true;
    let success = 0;
    let failed = 0;

    try {

      let mentions = (await this.client.getInbox({
        filter: `mentions`
      })).filter(comment => {
        return this.subsToMonitor.map(sub => sub.toLowerCase()).includes(comment.subreddit.display_name.toLowerCase())
      });

      // filter only actual comment replies which the bot didn't already comment on
      mentions = mentions.filter(message => message.was_comment == true)

      // only include new mentions (not dealt with by the bot)
      mentions = mentions.filter(comment => {
        return !this.oldMentions.includes(comment.id);
      })
      // remember all new mentions
      mentions.forEach(comment => {
        this.oldMentions.push(comment.id);
      })

      // filter out stale comments
      mentions = mentions.filter(comment => {
        return comment.created_utc*1000 >= Date.now()-this.invokationsStaleTimeout*1000;
      })

      let unrepliedInvocations = [];

      for (let comment of mentions) {
        if (!(await this.alreadyCommentedComment(comment))) {
          unrepliedInvocations.push(comment);
        } else {
          // console.log(`already replied...`);
        }
      }

      if (unrepliedInvocations.length > 0) {
        console.log(`unrepliedInvocations:`, unrepliedInvocations);
      }

      for (const comment of unrepliedInvocations) {

        const submission = await this.client.getSubmission(comment.parent_id);
  
        this.scanAndComment(submission, comment)
        .then(result => console.log(`commented successfully!`))
        .catch(err => console.error(`failed to reply with scan result:`, err));

      }

    } catch (err) {
      console.error(`an error occured checking for mentions:`, err);
    } finally {
      this.running.checkForMentions = false;
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