const test = require('./tester')
const server = require('./server')
const { required } = require('./route-helper')
const api = require('./api')
const http = require('http')

const STATE = 'someState'

let httpServer
test('server should start', [
  t => httpServer = http.createServer(server({
    routes: {
      OAUTH: {
        test: {
          authorizeUrl: 'http://localhost:2000/login/oauth/authorize',
          accessUrl: 'http://localhost:2000/login/oauth/access_token',
          setState: () => Promise.resolve(STATE),
          handler: ({ error, access_token, scope, token_type, state, req }) =>
            error
              ? Promise.reject(Error(error.message))
              : Promise.resolve('someSessionId'),
          opts: {
            client_secret: 'someSecret',
            client_id: 'someId',
            scope: 'someScope',
          },
        },
      },
      GET: {
        '/pouet': {
          noSession: true,
          params: { a: Number, b: String },
          handler: ({ a, b }) => ({ a, b }),
        },
        '/login/oauth/authorize': {
          noSession: true,
          params: {
            redirect_uri: String,
            client_id: String,
            scope: String,
            state: String,
          },
          handler: ({ redirect_uri, client_id, scope, state }) =>
            ({ redirect_uri, client_id, scope, state }),
        },
        '/end': {
          handler: ({ session }) => session,
        },
      },
      POST: {
        '/authorized': {
          params: { a: required(Number) },
          handler: ({ a }) => ({ a }),
        },
        '/papa': {
          noSession: true,
          params: { a: Number, b: String },
          handler: ({ a, b }) => ({ a, b }),
        },
        '/login/oauth/access_token': {
          noSession: true,
          params: ({
            client_secret: String,
            client_id: String,
            state: String,
            scope: String,
            code: String,
          }),
          handler: ({ client_secret, client_id, scope, code, state }) =>
            ({ client_secret, client_id, scope, code, state }),
        }
      },
    },
    domain: 'localhost',
    allowOrigin: '*',
    session: {
      redirect: 'http://localhost:2000/end',
      get: cookie => cookie === 'fail'
        ? Promise.reject(Error('fail cookie'))
        : Promise.resolve('6666'),
    },
  })).listen(2000, () => t.pass('server is up on port 2000'))
])

const localhost = api({
  host: 'localhost',
  protocol: 'http:',
  port: 2000,
})

test('server should return 404 on unserved path', [
  t => localhost.get.noroute()
    .then(t.fail, err => t.equal(err.statusCode, 404, 'correct statusCode')),
])

test('server should return 401 on Unauthorized call', [
  t => localhost.post.authorized({
    headers: { cookie: '4k=fail; Max-Age=604800; HttpOnly' },
    body: { a: 5 },
  }).then(t.fail, err => t.equal(err.statusCode, 401, 'correct statusCode')),
])

test('server should return 400 on invalid parameters', [
  t => localhost.post.authorized({ body: { b: 5 } })
    .then(t.fail, err => t.equal(err.statusCode, 400, 'correct statusCode')),
])

test('server should handle GET on /pouet', [
  t => localhost.get.pouet()
    .then(() => t.pass('Request success'), t.fail),
])

test('server should handle POST on /papa', [
  t => localhost.post.papa({ body: { a: 4, b: 'lol' } })
    .then(data =>
      t.deepEqual(data, { a: 4, b: 'lol' }, 'should return posted data'), t.fail),

  t => localhost.post.papa()
    .then(() => t.fail('Should have fail'), err =>
      t.equal(err.statusCode, 415, 'empty post should fail with 415')),
])

test('OAuth', [
  t => localhost.get.auth.test({
    assert: 302,
    noRedirect: true,
    getResponse: true,
  }).then(res => t.assert(res.headers.location
      .startsWith('http://localhost:2000/login/oauth/authorize'),
    'should redirect to authorizeUrl'), t.fail),
  t => localhost.get.auth.test()
    .then(params => t.deepEqual(params, {
      redirect_uri: 'localhost/auth/test/callback',
      client_id: 'someId',
      scope: 'someScope',
      state: 'someState',
    }, 'should obtain expected params after redirect'), t.fail),
  t => localhost.get.auth.test.callback({
    body: { state: 'someState' },
    headers: { cookie: '4k=someSessionId; Max-Age=604800; HttpOnly' },
  }).then(session => t.equal(session, '6666', 'should return expected session'))
    .catch(t.fail)

])

test('server the server should close gracefully', [
  t => t.equal(httpServer.close(), httpServer),
])
//*/
