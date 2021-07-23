class ScanError extends Error {
  constructor(message, ...extras) {

    super()

    Error.captureStackTrace(this, this.constructor)
    this.name = 'ScanError'
    this.message = message
    if (extras) {
      this.extras = extras
    }

  }
}

class MissingODError extends Error {
  constructor(message, ...extras) {

    super()

    Error.captureStackTrace(this, this.constructor)
    this.name = 'MissingODError'
    this.message = message
    if (extras) {
      this.extras = extras
    }

  }
}

class PMsDisabledError extends Error {
  constructor(message, ...extras) {

    super()

    Error.captureStackTrace(this, this.constructor)
    this.name = 'PMsDisabledError'
    this.message = message
    if (extras) {
      this.extras = extras
    }

  }
}

module.exports = {
  ScanError,
  MissingODError,
  PMsDisabledError,
}