// Node Dependecies
const { resolve } = require('path')
const { randomBytes } = require('crypto')
const { parse: parseUrl } = require('url')
const { parse: parseQuery, stringify: stringifyQuery } = require('querystring')

// External Dependecies
const body = require('body/any')
const cookie = require('cookie')

// Internal Dependecies
const c = require('./4k')
const request = require('./request')
const { isError, toJSON, boom, _404, _500, ERROR } = require('./errors')
const isThennable = val => val && typeof val.then === 'function'
const IS_ASYNC = Symbol('@@Async')
const PARAMS = Symbol('@@Params')

const formatUrl = (base, query) => `${base}?${stringifyQuery(query)}`
const getRedirect = (data, setState, authorizeUrl, goToLocation) => {
  if (!setState) {
    data.state = randomBytes(8).toString('hex')
    const location = formatUrl(authorizeUrl, data)
    return res => goToLocation(location, res)
  }
  const genLocation = (state, res) =>
    goToLocation(formatUrl(authorizeUrl, Object.assign({ state }, data)), res)
  return res => {
    const ret = setState(res)
    return isThennable(ret)
      ? ret.then(state => genLocation(state, res))
      : genLocation(ret, res)
  }
}

const handleRedirect = (location, res) => {
  res.statusCode = 302
  res.setHeader('location', location)
  res.end('"OK"')
}

const saveError = (ret, name, err) =>
  (ret[ERROR] || (ret[ERROR] = {}))[name] = err.message

const parseParam = (name, parser) => ret => {
  try {
    if (isThennable(ret[name] = parser(ret[PARAMS][name], ret))) {
      const q = ret[name]
        .then(v => ret[name] = v, err => saveError(ret, name, err))
      ret[IS_ASYNC] ? ret[IS_ASYNC].push(q) : (ret[IS_ASYNC] = [ q ])
    }
  } catch (err) { saveError(ret, name, err) }
  return ret
}

const sendAnswerValue = (res, value, info) => {
  if (typeof value === 'function') return value(res, sendAnswerValue)
  if (isError(value)) {
    res.statusCode = value.statusCode || value.code || 500
    res.statusMessage = value.statusMessage || value.message || _500.message
    return res.end(toJSON(value))
  }
  if (value instanceof Error) {
    res.statusCode = value.statusCode || value.code || 500
    res.statusMessage = value.statusMessage || value.message || _500.message
    return res.end(JSON.stringify({
      message: value.message,
      stack: value.stack,
      info,
    }))
  }
  try { res.end(JSON.stringify(value)) }
  catch (err) {
    console.error('failed to send', value)
    sendAnswerValue(res, err)
  }
}

const prepareRoute = (route, session) => {
  let { params } = route
  if (session && !route.noSession) {
    (params || (params = {})).session = (_, { req }) =>
      session.get(cookie.parse(req.headers.cookie || ''), req)
  }
  if (params) {
    route.parse = c.fast(Object.keys(params)
      .map(name => parseParam(name, params[name])))
    route.bodyOpts || (route.bodyOpts = {})
  }
}
const sessionDefaults = { key: '4k', httpOnly: true, maxAge: 60 * 60 * 24 * 7 }
module.exports = ({ routes, domain, allowOrigin, session }) => {
  session && session.options
    ? c.defaults(session.options, sessionDefaults)
    : session.options = sessionDefaults

  const addOauthRoute = route => {
    const { authorizeUrl, serviceName, accessUrl, setState, handler, opts } = route
    const { scope, client_id, client_secret } = opts
    const redirect = getRedirect({
      redirect_uri: `${domain}/auth/${serviceName}/callback`,
      client_id,
      scope,
    }, setState, authorizeUrl, handleRedirect)
    const getUrl = Object.assign(parseUrl(accessUrl), {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'NaN-App' },
      method: 'POST',
    })

    routes.GET[`/auth/${serviceName}`] = { handler: () => redirect, noSession: true }
    routes.GET[`/auth/${serviceName}/callback/`] = {
      params: { code: String, state: String },
      noSession: true,
      handler: ({ code, state, req }) => code
        ? request(getUrl, { client_secret, client_id, state, scope, code })
          .then(body => {
            const value = handler(Object.assign(parseQuery(body), { state, req }))
            if (!session) return value
            return res => {
              res.setHeader('Set-Cookie',
                cookie.serialize(session.key, value, session.options))
              goToLocation(session.redirect, res)
            }
          })
        : Error('missing oauth code'),
    }
  }

  if (routes.OAUTH) {
    routes.GET || (routes.GET = Object.create(null))
    Object.keys(routes.OAUTH).forEach(serviceName =>
      addOauthRoute(Object.assign({ serviceName }, routes.OAUTH[serviceName])))
  }

  Object.keys(routes).forEach(methodKey =>
    methodKey !== 'OAUTH' && Object.keys(routes[methodKey])
      .forEach(routeKey => prepareRoute(routes[methodKey][routeKey], session)))

  const setHeaderAndAnswer = (res, value, info) => {
    // console.log({ res, value, info })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Access-Control-Allow-Origin', allowOrigin)
    return sendAnswerValue(res, value, info)
  }

  const sendAnswer = (res, answer, info) => {
    if (!isThennable(answer)) return setHeaderAndAnswer(res, answer, info)
    const handle = val => setHeaderAndAnswer(res, val, info)
    return answer.then(handle, handle)
  }

  const handleParamErrors = (res, params, handler) => params[ERROR]
    ? sendAnswer(res, Error('Wrong Parameters'), params[ERROR])
    : sendAnswer(res, handler(params))

  const parseRawParams = (req, res, route, rawParams) => {
    rawParams && typeof rawParams === 'object' || (rawParams = {})
    const params = route.parse(req.parsed = { [PARAMS]: rawParams, req })
    return params[IS_ASYNC]
      ? Promise.all(params[IS_ASYNC])
        .then(() => handleParamErrors(res, params, route.handler))
      : handleParamErrors(res, params, route.handler)
  }

  return (req, res) => {
    const methods = routes[req.method]
    if (!methods) return setHeaderAndAnswer(res, _404)
    const { pathname, query } = parseUrl(req.url)
    const route = methods[pathname] || methods[pathname + '/']
    if (!route) return setHeaderAndAnswer(res, _404)
    if (!route.params) return sendAnswer(res, route.handler({ req }))
    if (req.method === 'GET') return parseRawParams(req, res, route, parseQuery(query))
    return body(req, res, route.bodyOpts, (err, rawParams) => err
      ? setHeaderAndAnswer(res, err)
      : parseRawParams(req, res, route, rawParams))
  }
}
