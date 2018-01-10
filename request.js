const http = require('http')
const https = require('https')
const { parse: parseUrl } = require('url')
const { stringify: queryStringify } = require('querystring')
const errors = require('./errors')
const c = require('4k')

const parseUrlInto = (url, opts) => {
  const parsed = parseUrl(url)
  opts.path = parsed.path
  opts.host = undefined
  opts.hostname = parsed.hostname
  opts.port = parsed.port
  opts.protocol = parsed.protocol || 'https:'
  return opts
}

// supported encoding by node buffer
// utf8 utf-8 ucs2 ucs-2 utf16le utf-16le latin1 binary base64 ascii hex
const CHARTSET_RE = /\bcharset\s{0,10}=\s{0,10}([a-z1-8-]{3,8})/i
const getContentType = headers =>
  (headers && (headers['content-type'] || headers['Content-Type']))
    || ''

const isJSON = headers => getContentType(headers).includes('application/json')

const _E = Symbol('@@ExtraData')
function storeBody(chunk) { this[_E].body.push(chunk) }
function endRequest() {
  let { body, getResponse, toJSON, isBinary, s, f } = this[_E]
  try {
    body = isBinary === 'binary' ? Buffer.concat(body) : body.join('')
    toJSON && (body = JSON.parse(body))
    getResponse ? s((this.body = body, this)) : s(body)
  } catch (err) {
    err.response = this
    err.body = body
    f(err)
  }
}

function handle(response) {
  const { s, f, assert, responseEncoding, getResponse, noRedirect } = this[_E]

  if (!noRedirect && response.statusCode === 302) {
    const cookies = response.headers['Set-Cookie']
    cookies && (this[_E].headers.cookie = cookies)
    return execRequest(parseUrlInto(response.headers.location, this[_E]), s, f)
  }

  const contentType = getContentType(response.headers)
  const encoding = responseEncoding
    || contentType.split(CHARTSET_RE)[1]
    || 'ascii'


  if (!assert(response)) {
    const error = errors.boom[response.statusCode]()
    error.res = response
    return f(error)
  }
  response[_E] = {
    isBinary: encoding === 'binary',
    toJSON: contentType.includes('application/json'),
    body: [],
    getResponse,
    s, f,
  }
  response.setEncoding(encoding)
  response.on('data', storeBody).on('error', f).on('end', endRequest)
}

const log = opts => {
  console.log('<', opts.method, `${opts.protocol}//${opts.host}${opts.path}`)
  opts.body && console.log('  -> ', opts.body)
}

const execRequest = (opts, s, f) => {
  const req = (opts.protocol === 'http:' ? http : https).request(opts, handle)
  req[_E] = (opts.s = s, opts.f = f, opts)
  req.setNoDelay(!opts.withDelay)
  req.on('error', f)
  req.end(opts.body)
}

const request = ((_op, executor = (s, f) => _op = execRequest(_op, s, f)) =>
    opts => (_op = opts, new Promise(executor)))()

const status200 = res => res.statusCode === 200
const buildOpts = (opts = {}) => {
  if (typeof opts === 'string') {
    opts = parseUrlInto(opts, Object.create(null))
  } else {
    opts.url && parseUrlInto(opts.url, opts)
  }
  opts.method || (opts.method = 'GET')
  if (opts.body && typeof opts.body !== 'string') {
    if (isJSON(opts.headers)) {
      opts.body = JSON.stringify(opts.body)
    } else if (opts.method === 'GET') {
      opts.path = `${opts.path || ''}?${queryStringify(opts.body)}`
      opts.body = undefined
    } else {
      setHeader.type.urlEncoded(opts)
      opts.body = queryStringify(opts.body)
    }
  }
  if (opts.assert) {
    if (typeof opts.assert !== 'function') {
      if (Array.isArray(opts.assert)) {
        const expectedStatus = opts.assert
        opts.assert = res => expectedStatus.includes(res.statusCode)
      } else {
        const expectedStatus = Number(opts.assert)
        if (!errors[expectedStatus]) {
          throw Error(`${opts.assert} is not a valid http statusCode`)
        }
        opts.assert = res => res.statusCode === expectedStatus
      }
    }
  } else {
    opts.assert = status200
  }
  return opts
}

const compose = fns => Array.isArray(fns)
  ? fns.length === 1 ? fns[0] : fns.reduce((a, b) => a(b))
  : fns

const extend = fns => (setters => opts =>
  request(buildOpts(setters(opts))))(c.fast(fns))

const setOpt = (key, value) => opts => (opts[key] = value, opts)
const setHeader = (key, value) => opts =>
  ((opts.headers || (opts.headers = {}))[key] = value, opts)
setHeader.type = val => setHeader('Content-Type', val)
setHeader.type.byteranges = setHeader.type('multipart/byteranges')
setHeader.type.form = setHeader.type('multipart/form-data')
setHeader.type.urlEncoded = setHeader.type('application/x-www-form-urlencoded')
setHeader.type.stream = setHeader.type('application/octet-stream')
setHeader.type.xhtml = setHeader.type('application/xhtml+xml')
setHeader.type.json = setHeader.type('application/json')
setHeader.type.pdf = setHeader.type('application/pdf')
setHeader.type.xml = setHeader.type('application/xml')
setHeader.type.javascript = setHeader.type('text/javascript')
setHeader.type.plain = setHeader.type('text/plain')
setHeader.type.html = setHeader.type('text/html')
setHeader.type.css = setHeader.type('text/css')
extend.methods = fns => http.METHODS.reduce((acc, m) => {
  const key = m.toLowerCase().replace(/-([a-z])/g, '$1')
  acc[key] = extend([ ...fns, setOpt('method', m) ])
  return acc
}, fns.length ? extend(fns) : Object.create(null))

module.exports = Object.assign(opts =>
  request(buildOpts(opts)), {
    ...extend.methods([]),
    json: extend.methods([ setHeader.type.json ]),
    extend: extend.methods,
    extendWithoutMethods: extend,
    setHeader,
    setOpt,
    buildOpts,
    use: defaultsOpts => {
      const defaults = buildOpts(defaultsOpts)
      const defaultKeys = Object.keys(defaults)
      let k
      return opts => {
        if (!opts) return defaults
        for (k of defaultKeys) {
          if (opts[k] == null) {
            opts[k] = defaults[k]
          } else if (k === 'headers') {
            Object.assign(opts.headers, defaults.headers)
          }
        }
        return opts
      }
    },
    prepend: (key, value) => opts => (opts[key] = opts[key] + value, opts),
    map: (key, fn) => opts => (opts[key] = fn(opts[key]), opts),
    t: fn => opts => (fn(opts), opts),
  })


/*
  you can give it all the options (http | https) request take
  It use https by default unless you specify the protocol
  It will parse strings as url or look for a url property in option argument
  It returns a promise

// Usage examples :

request('http://lol.com')
  .then(textResponse => ...)

request({ url: 'http://lol.com', headers: { 'X-Fake-Header': 'some value' } })
  .then(textResponse => ...)

// data send is automaticaly stringified
request('https://api.test.com', { some: 'data' })
// this is equivalent to :
curl -X GET https://api.test.com?some=data

// If the json header is set it will send it in JSON in the body
request.json.post('https://api.test.com', { some: 'data' })
// this is equivalent to :
curl -X POST https://api.test.com \
     -H 'Content-Type: application/json' \
     --data '{"some":"data"}'

// If you want to send a string, stringify it first
request.json.post('https://api.test.com', JSON.strinigify('data'))

request({
  method: 'POST,
  host: 'api.cloudflare.com',
  path: '/client/v4/zones/023e105f4ecef8ad9ca31a8372d0c353/dns_records',
  headers: {
    'X-Auth-Email': process.env.CLOUDFLARE_EMAIL,
    'X-Auth-Key': process.env.CLOUDFLARE_APIKEY,
    'Content-Type': 'application/json',
  },
}, { some: 'data' }).then(JSON.parse)

// this can be done using the shorthands
request.json.post({
  host: 'api.cloudflare.com',
  path: '/client/v4/zones/023e105f4ecef8ad9ca31a8372d0c353/dns_records',
  headers: {
    'X-Auth-Email': process.env.CLOUDFLARE_EMAIL,
    'X-Auth-Key': process.env.CLOUDFLARE_APIKEY,
  },
}, { some: 'data' }).then(JSON.parse)

// you can create your own shorthands easly with request.extend
const cf = request.extend([
  // You can use setOpt and setHeader
  request.setOpt('host', 'api.cloudflare.com'),
  request.setHeader('X-Auth-Email', process.env.CLOUDFLARE_EMAIL),
  request.setHeader('X-Auth-Key', process.env.CLOUDFLARE_APIKEY),
  request.setHeader.type.json,
  // or create a custom transformation:
  opts => {
    // transformations are called after the defaults are initialized
    // so even if you pass a string url as opts, it will be parsed here
    opts.path = `/client/v4/zones/${process.env.CLOUDFLARE_ZONE}${opts.path}`
    return opts // you must return a valid option object
  },
])

// and use it like so
cf.get('/dns_records/', { name: 'my.domain.com' })
  .then(JSON.parse)

cf.post('/dns_records/', { some: 'data' })
  .then(JSON.parse)

// assert (default to 200, can be a status code, an array of statusCodeor a function)
// responseEncoding (will extract it form the content type or use ascii)
// getResponse ()

// transformers utils :
// the most basic one is `t`, which return the opts object for you
request.t(opts => opts.path = `${opts.path}`)
*/
