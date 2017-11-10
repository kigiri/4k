const test = require('./tester')
const server = require('./server')
const api = require('./api')
const http = require('http')

let httpServer
test('server should start', [
  t => httpServer = http.createServer(server({
    routes: {
      GET: {
        '/pouet': {
          params: { a: Number, b: String },
          handler: ({ a, b }) => ({ a, b }),
        },
      },
      POST: {
        '/papa': {
          params: { a: Number, b: String },
          handler: ({ a, b }) => ({ a, b }),
        },
      },
    },
    domain: 'localhost',
    allowOrigin: '*',
    session: {
      get: () => Promise.resolve('6666'),
    },
  })).listen(2000, () => t.pass('server is up on port 2000'))
])

const localhost = api({
  host: 'localhost',
  protocol: 'http:',
  port: 2000,
})

test('server should handle return 404 on unserved path', [
  t => localhost.noroute()
    .then(t.fail, err => t.equal(err.statusCode, 404, 'correct statusCode')),
])

test('server should handle GET on /pouet', [
  t => localhost.pouet()
    .then(() => t.pass('Request success'), err =>
      console.log(err) || t.fail('woops')),
])

test('server should handle POST on /papa', [
  t => localhost.papa.post({ body: { a: 4, b: 'lol' } })
    .then(data =>
      t.deepEqual(data, { a: 4, b: 'lol' }), t.fail),

  t => localhost.papa.post()
    .then(() => t.fail('Should have fail'), err =>
      t.equal(err.statusCode, 415, 'empty post should fail with 415')),
])

test('server the server should close gracefully', [
  t => t.equal(httpServer.close(), httpServer),
])
//*/
