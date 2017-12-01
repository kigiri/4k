const { STATUS_CODES } = require('http')
const error = Object.create(null)
const boom = Object.create(null)
const ERROR = Symbol('@@ErrorTag')
const J = Symbol('@@JSONCache')
const isError = err => Boolean(err && err[ERROR])
const safeStringify = err => {
  try { return err[J] = JSON.stringify(err) }
  catch (e) { return error._500[J] }
}
const toJSON = err => (err && err[J]) || safeStringify(err)

const buildError = (err, code) => {
  err.code = code
  err.stack = err.stack
  err.message = err.message
  err.statusMessage = STATUS_CODES[code]
  err.statusCode = code
  err[ERROR] = true
  return err
}

Object.keys(STATUS_CODES).map(Number).map(code => {
  const message = STATUS_CODES[code]
  error[code] = error['_'+code] = buildError(Error(message), code)
  error[code][J] = JSON.stringify(error[code])
  const handler = boom[code] = boom['_'+code] = (err = Error(message)) => {
    if (isError(err)) throw err
    Error.captureStackTrace(err, handler)
    if (err.stack) return buildError(err, code)
    if (err.then) return err.then(undefined, handler)
    return buildError(err, code)
  }
})

module.exports = Object.assign(error, { boom, isError, toJSON, ERROR })
