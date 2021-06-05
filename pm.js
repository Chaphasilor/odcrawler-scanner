const Snoowrap = require('snoowrap');

async function sendPM(client, recipient, threadTitle, body) {

  let result = await client.composeMessage({
    to: recipient,
    subject: threadTitle,
    text: body,
  })

  let lastSentPM = await client.getSentMessages({
    amount: 1,
  })[0]

  console.log(`lastSentPM:`, lastSentPM)
  return lastSentPM.id
  
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