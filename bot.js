const Snoowrap = require('snoowrap');
const { scanUrls, extractUrls } = require('./util');
const { ScanError, MissingODError } = require(`./errors`)
const { sendPM } = require(`./pm`)

module.exports = class Bot {

  constructor(toScrape, praises, clientOptions, blacklistedUsers, staleTimeout) {

    this.BOT_START = Date.now() / 1000;
    //TODO limit array size!!!
    this.oldSubmissions = [];
    this.oldMentions = [];
    this.oldPMs = [];
    this.toScrape = toScrape;
    this.praises = praises;
    this.blacklistedUsers = blacklistedUsers;
    this.invocationsStaleTimeout = staleTimeout;
    this.client = new Snoowrap(clientOptions);
    this.username = clientOptions.username;
    this.subsToMonitor = Object.values(this.toScrape).reduce((allSubs, sorting) => [...allSubs, ...sorting], []);
    this.devLink = 'https://www.reddit.com/message/compose?to=Chaphasilor&subject=[ODScanner-Contact]';
    this.feedbackLink = 'https://www.reddit.com/message/compose?to=Chaphasilor&subject=[ODScanner-Feedback]';
    this.running = {
      refreshSubmissions: false,
      checkInbox: false,
      checkPMs: false,
      checkForMentions: false,
      scanNextInQueue: false,
    }

    this.scanQueue = []

  }

  startPolling({ submissionsIntervall, inboxIntervall, mentionsIntervall, processQueueIntervall }) {

    if (submissionsIntervall > 0) {
      this.pollSubmissions(submissionsIntervall);
    }
    if (inboxIntervall > 0) {
      this.pollInbox(inboxIntervall);
    }
    if (mentionsIntervall > 0) {
      this.pollMentions(mentionsIntervall);
    }
    if (processQueueIntervall > 0) {
      this.processQueue(processQueueIntervall);
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

  processQueue(seconds) {
    this.scanNextInQueue();
    setInterval(() => {
      if (!this.running.scanNextInQueue) {
        this.scanNextInQueue();
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
      return false;
    }
  }

  generateComment(scanResults, originalUrls, devLink, feedbackLink) {

    let characters = 0
    
    let completelyFailed = scanResults.failed.filter(x => x.reddit == undefined)
    let partiallyFailed = scanResults.failed.filter(x => x.reddit != undefined)
    
    let failedString = `  \n`
    
    if (partiallyFailed.length > 0) {
      failedString = `  \n
*I encountered issues scanning the following URLs, but still managed to scan them*:  \n`
      let partiallyFailedTable = partiallyFailed.reduce((tableString, cur) => {
        return `  \n${tableString}\n${cur.reddit}${cur.missingFileSizes ? `^(File sizes are not included because the scan might take a long time. Reply \`!size\` to start a low-priority scan including file sizes (could take a few hours\))  \n` : ``}(Error cause: ${cur.reason})  \n`;
      }, ``);

      failedString += partiallyFailedTable
      
    }
    
    if (completelyFailed.length > 0) {
      failedString = `  \n
*Whoops, I failed to scan the following URLs*:  \n
|URL|Reason|
|---|------|
`
      for (const { url, reason } of scanResults.failed) {
        failedString += `|${url}|${reason}|\n`
      }
      failedString += `\n*I swear I really tried* [ಥ\_ಥ](https://i.imgur.com/CJMGxMs.mp4)  \n`
    }
    
    let commentsArray = [`\
*Here are the scan results*:  
    `]
    
    for (const scanResult of scanResults.successful) {

      let odResultString = `\n${scanResult.reddit}${scanResult.missingFileSizes ? `^(File sizes are not included because the scan might take a long time. Reply \`!size\` to start a low-priority scan including file sizes (could take a few hours\))` : ``}\n`
      // split the following results into a new comment/string
      if (commentsArray[commentsArray.length-1].length > 9500) {
        commentsArray.push(odResultString)
      }
      commentsArray[commentsArray.length-1] += odResultString

    };

    commentsArray[commentsArray.length-1] += `
${failedString}
${scanResults.successful[0].credits}  

---

*I'm a bot, beep, boop!*

^([Contact Developer](${devLink}) | [Give Feedback](${feedbackLink}))
    `;

    return commentsArray

  }

  async scanAndComment(submission, comment) {

    submission = await submission.fetch();

    let odUrls;
    
    if (comment) {
      comment = await comment.fetch();
    }

    odUrls = await extractUrls(comment, true);

    if (odUrls.length > 0) {
      console.log(`scanning *comment with custom urls* on '${submission.title}' (https://reddit.com/${submission.id})`);
    } else {
      console.log(`scanning '${submission.title}' (https://reddit.com/${submission.id})`);
      odUrls = await extractUrls(submission);
    }

    
    console.log(`odUrls:`, odUrls);

    if (!odUrls || odUrls.length === 0) {
      throw new MissingODError(`No OD URLs found`)
    }

    let scanResults = {
      successful: [],
      failed: [],
    };

    try {
      
      scanResults = await scanUrls(odUrls);

    } catch (err) {
      throw err
    }
    
    try {

      await this.replyWithResults(scanResults, odUrls, submission, comment)
        
    } catch (err) {
      throw new Error(`error replying to https://reddit.com/${submission.id}: ${err}`);
    }
    
  }

  async replyWithResults(scanResults, odUrls, submission, comment) {

    let lastReply;
    let commentArray = this.generateComment(scanResults, odUrls, this.devLink, this.feedbackLink)

    if (commentArray.length > 1) {
      console.warn(`Character limit exceeded! Splitting into multiple comments...`)
    }
    
    // reply the first time
    if (comment) {
      lastReply = await comment.reply(commentArray.shift());
      console.log(`replied to comment https://reddit.com/comments/${submission.id}/_/${comment.id}`);
    } else {
      lastReply = await submission.reply(commentArray.shift());
      console.log(`replied to '${submission.title}' (https://reddit.com/${submission.id})`);
    }

    // search the subreddit's mods for the bots user name
    let sub = await this.client.getSubreddit(lastReply.subreddit.display_name);
    let mod = await sub.getModerators({ name: this.username });

    if (mod.length > 0 && mod[0].mod_permissions.includes('posts')) {
      await lastReply.approve();
      console.log('approved comment');
    }
    
    // create the remaining comments
    for (const commentBody of commentArray) {

      await this.sleep(5*1000)
      lastReply = await lastReply.reply(commentBody);
      console.log(`Extended reply on https://reddit.com/comments/${submission.id}/_/${comment.id}`)
      
      // approve reply if bot is a moderator with posts permission
      if (mod.length > 0 && mod[0].mod_permissions.includes('posts')) {
        await lastReply.approve();
        console.log('approved comment');
      }

    }
    
  }

  async apologize(submissionOrComment, reason) {

    await this.sleep(1000*10) // wait 10 seconds to (hopefully) prevent rate limiting

    let reply = await submissionOrComment.reply(`
Sorry, I didn't manage to scan this OD :/

I swear I really tried [ಥ\_ಥ](https://i.imgur.com/CJMGxMs.mp4)

${reason ? `(Reason: ${reason})` : ``}
    `);
    console.log(`apologized to ${submissionOrComment.id}`);
    
  }

  async replyMissingOD(submissionOrComment, reason) {

    await this.sleep(1000*10) // wait 10 seconds to (hopefully) prevent rate limiting

    let reply = await submissionOrComment.reply(`
Sorry, I couldn't find any OD URLs in both the post or your comment  :/
    `);
    console.log(`replied to ${submissionOrComment.id} about missing OD URLs`);
    
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

            //FIXME add to scan queue instead
            await this.scanAndComment(submission);
            count++;

          } catch (err) {

            if (err.message.includes(`DELETED_SUBMISSION`)) { //TODO not sure if this exists for submissions
              console.warn(`Submission was deleted by the user!`)  
            } else {
  
              console.error(`failed to reply with scan result:`, err)
  
              if (err instanceof ScanError) {
  
                try {
                  await this.apologize(submission, err.message)
                } catch (err) {
                  console.error(`Failed to apologize:`, err)
                }
                
              } else if (err instanceof MissingODError) {
  
                try {
                  await this.replyMissingOD(submission, err.message)
                } catch (err) {
                  console.error(`Failed to reply about missing ODs:`, err)
                }
  
              } else {
  
                try {
                  await this.apologize(submission, `Something went really wrong. /u/Chaphasilor please help o.O`)
                } catch (err) {
                  console.error(`Failed to apologize:`, err)
                }
                
              }
  
            }
            
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

  //TODO implement PM scanning and activate
  async checkForPMs() {

    console.log('checking inbox for PMs...');
    this.running.checkPMs = true;
    let success = 0;
    let failed = 0;

    try {

      let pms = []
      try {

        pms = (await this.client.getInbox({
          filter: `messages`
        }))

      } catch (err) {
        console.error(`Couldn't load PMs, seems like there aren't any?:`, err)
      }

      // only include new PMs (not dealt with by the bot)
      pms = pms.filter(message => {
        return !this.oldPMs.includes(message.id);
      })
      // remember all new PMs
      pms.forEach(message => {
        this.oldPMs.push(message.id);
      })
      
      // filter out stale PMs
      pms = pms.filter(message => {
        return message.created_utc*1000 >= Date.now()-this.invocationsStaleTimeout*1000;
      })
      
      if (pms.length > 0) {
        console.log(`pms:`, pms);
      }

      for (let message of unrepliedInvocations) {

        message = await (await this.client.getMessage(message.id)).fetch() // reload the comment because a message fetched via the inbox *might be* missing some fields

        try {

          await this.scanAndComment(submission, message)
          console.log(`commented successfully!`)

        } catch (err) {

          if (err.message.includes(`DELETED_COMMENT`)) {
            console.warn(`Invoking comment was deleted by the user!`)  
          } else {

            console.error(`failed to reply with scan result:`, err)

            if (err instanceof ScanError) {

              try {
                await this.apologize(message, err.message)
              } catch (err) {
                console.error(`Failed to apologize:`, err)
              }
              
            } else if (err instanceof MissingODError) {

              try {
                await this.replyMissingOD(message, err.message)
              } catch (err) {
                console.error(`Failed to reply about missing ODs:`, err)
              }

            } else {

              try {
                await this.apologize(message, `Something went really wrong. /u/Chaphasilor please help o.O`)
              } catch (err) {
                console.error(`Failed to apologize:`, err)
              }
              
            }

          }

          
        }

      }

    } catch (err) {
      console.error(`an error occurred checking for mentions:`, err);
    } finally {
      this.running.checkPMs = false;
    }

  }

  async checkForMentions() {

    // console.log('checking inbox for mentions...');
    this.running.checkForMentions = true;
    let success = 0;
    let failed = 0;

    try {

      let mentions = []
      try {

        mentions = (await this.client.getInbox({
          filter: `mentions`
        })).filter(comment => {
          return this.subsToMonitor.map(sub => sub.toLowerCase()).includes(comment.subreddit.display_name.toLowerCase())
        });

      } catch (err) {
        console.error(`Couldn't load mentions, seems like there aren't any?:`, err)
      }

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
        return comment.created_utc*1000 >= Date.now()-this.invocationsStaleTimeout*1000;
      })
      
      let unrepliedInvocations = [];

      // temporary workaround until https://github.com/not-an-aardvark/snoowrap/issues/305 is resolved
      // console.log(`sleeping 10s before checking comments for replies`)
      await this.sleep(10000)

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

      for (let comment of unrepliedInvocations) {

        comment = await (await this.client.getComment(comment.id)).fetch() // reload the comment because a comment fetched via the inbox is missing some fields (like link_id)

        // const submission = await this.client.getSubmission(comment.context.split(`/`)[4]);
        const submission = await (await this.client.getSubmission(comment.link_id)).fetch();
  
        // add new mention to the queue
        if (!this.scanQueue.find(x => x.submission.id === submission.id)) {

          let threadTitle = `Scan Request on ${(new Date()).toUTCString()}`

          // // only send the acknowledgement if there are other scans in the queue
          //TODO this can only be uncommented if instead a pm is sent saying that the scan started
          // if (this.scanQueue.length > 0 || this.running.scanNextInQueue) {
            
            let threadId = await sendPM(this.client, comment.author.name, threadTitle,
`*I've received your request and added it to the queue :)*

[Link to invoking comment](https://reddit.com/comments/${submission.id}/_/${comment.id})`
            )

          // }
          
          //TODO also save the time when the scan was added to the queue, can be used to decide whether or not to notify the user that the scan started (if the scan is likely to take a bit longer)
          this.scanQueue.push({
            submission,
            comment,
            threadTitle, 
          })

        }

      }

    } catch (err) {
      console.error(`an error occurred checking for mentions:`, err);
    } finally {
      this.running.checkForMentions = false;
    }

  }

  async scanNextInQueue() {

    if (this.scanQueue.length > 0) {

      this.running.scanNextInQueue = true

      
      // load scan job from the queue
      const { submission, comment, threadTitle } = this.scanQueue.shift()
      
      try {
        // await sendPM(this.client, comment.author.name, `re: ${threadTitle}`, `*I've started scanning the OD(s) you've requested a scan on!*`)
        
        await this.scanAndComment(submission, comment)
        console.log(`commented successfully!`)

      } catch (err) {

        if (err.message.includes(`DELETED_COMMENT`)) {
          console.warn(`Invoking comment was deleted by the user!`)  
        } else if (err.message.includes(`RATELIMIT`)) {

          let match = err.message.match(/Take a break for (\d+) seconds/)
          if (match.length > 1) {
            console.warn(`Ratelimited for ${match[1]} seconds!`)
            await this.sleep(1000 * parseInt(match[1]) * 1.5) // wait a bit longer that the duration reported by the API
          }

        } else {

          console.error(`failed to reply with scan result:`, err)

          if (err instanceof ScanError) {

            try {
              await this.apologize(comment, err.message)
            } catch (err) {
              console.error(`Failed to apologize:`, err)
            }
            
          } else if (err instanceof MissingODError) {

            try {
              await this.replyMissingOD(comment, err.message)
            } catch (err) {
              console.error(`Failed to reply about missing ODs:`, err)
            }

          } else {

            try {
              await this.apologize(comment, `Something went really wrong. /u/Chaphasilor please help o.O`)
            } catch (err) {
              console.error(`Failed to apologize:`, err)
            }
            
          }

        }

        
      }

      this.running.scanNextInQueue = false
      
    }

  }

  // async updateLink(comment, scanResults) {

  //   let submission = await this.client.getSubmission(comment.parent_id);
  //   submission.url = await submission.url;
  //   submission.id = await submission.id;

  //   await comment.edit(this.generateComment(scanResults, this.devLink, this.feedbackLink));
  //   console.log('updated link on ', 'https://reddit.com/' + submission.id);

  // }

  sleep(ms) {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, ms);
    })
  }

}