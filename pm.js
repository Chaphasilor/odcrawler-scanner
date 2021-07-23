const Snoowrap = require('snoowrap');
const { PMsDisabledError } = require('./errors');

async function sendPM(client, recipient, threadTitle, body) {

  try {

    let result = await client.composeMessage({
      to: recipient,
      subject: threadTitle,
      text: body,
    })
    
    let lastSentPM = await client.getSentMessages({
      amount: 1,
    })[0]
    
    // console.log(`lastSentPM:`, lastSentPM)
    return lastSentPM.id

  } catch (err) {

    if (err.message.includes(`NOT_WHITELISTED_BY_USER_MESSAGE`)) {
      throw new PMsDisabledError(`User has disabled PMs from strangers, not sending the PM!`)
    } else {
      throw err
    }

  }
  
}
module.exports.sendPM = sendPM

// async function replyToThread(client, threadId, body) {

//   let firstMessage = await client.getMessage(threadId)
//   console.log(`firstMessage:`, firstMessage)
//   console.log(`Replying to thread...`)
//   let result = await firstMessage.reply(body)
//   console.log(`result:`, result)
  
// }
// module.exports.replyToThread = replyToThread