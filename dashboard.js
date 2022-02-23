const http = require(`http`)
const Koa = require(`koa`)
const Router = require(`@koa/router`)
const cors = require(`@koa/cors`)
const compress = require('koa-compress')
const bodyParser = require(`koa-bodyparser`)
const ms = require(`ms`)
const Bot = require('./bot')

/**
 * 
 * @param {Bot} bot 
 * @returns 
 */
function createDefaultRouter(bot) {

  const defaultRouter = new Router()

  //#region ENDPOINTS

  // app.use(async (context, next) => {
  //   if (context.method === `GET` && context.path === `/keepalive`) {
  //     context.status = 201
  //     context.body = `Ha, ha, ha, ha\nStayin' alive, stayin' alive`
  //   }
  //   await next() // ALWAYS use `await` with next, to wait for other middlewares before sending the response
  // })

  defaultRouter.get(`/`, async (context, next) => {
    context.body = `Online
Queue size: ${bot.scanQueue.length}
Uptime: ${ms(Date.now() - bot.BOT_START*1000 )}
Registred mentions: ${bot.oldMentions.length}
Running operations: ${Object.entries(bot.running).filter(([key, value]) => value).map(([key, value]) => key).join()}
    `
    await next() // ALWAYS use `await` with next, to wait for other middlewares before sending the response
  })
  defaultRouter.get(`/queue`, async (context, next) => {
    context.body = JSON.stringify(bot.scanQueue)
    await next() // ALWAYS use `await` with next, to wait for other middlewares before sending the response
  })

  //#endregion ENDPOINTS

  return defaultRouter
  
}

module.exports.Dashboard = class Dashboard {

  /**
   * 
   * @param {Bot} bot the bot instance
   * @param {Router} router a Koa router instance
   */
  constructor(bot, router = createDefaultRouter(bot)) {

    this.bot = bot
    this.router = router

    this.init()

  }

  init() {

    const app = new Koa()
    app.use(cors())
    app.use(compress({
      br: {
        params: {
          [require(`zlib`).constants.BROTLI_PARAM_QUALITY]: 5
        }
      },
    }))
    app.use(bodyParser())

    let server = http.createServer(app.callback())
    server.listen(process.env.PORT)

    app
    .use(this.router.routes())
    .use(this.router.allowedMethods())
    
  }
  
}
