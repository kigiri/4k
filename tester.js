const tape = require('tape')

module.exports = (message, _t, timeout = 1000) =>
  tape(message, { timeout }, t => {
    const tests = (Array.isArray(_t) ? _t : [ _t ])
    t.plan(tests.length)
    tests.forEach(tt => tt(t))
  })
