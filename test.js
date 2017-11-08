const tape = require('tape')

const test = (message, _t) => tape(message, t => {
  const tests = (Array.isArray(_t) ? _t : [ _t ])
  t.plan(tests.length)
  tests.forEach(tt => tt(t))
})

const c = require('./4k')
const add = (a, b) => a + b
const addCurry = c.curry(add)
const add4 = addCurry(4)
const subDefaults = (a = 0, b = 0, c = 0) => a - b - c
const subN2 = c.curry(subDefaults, 2)
const subN3 = c.curry(subDefaults, 3)

test('curry', [
  t => t.equal(addCurry(4, 4), add(4, 4), 'normal call'),
  t => t.equal(add4(4), add(4, 4), 'curry call'),
  t => t.equal(add4(10), add(4, 10), 'curry successive call'),
  t => t.equal(subN2(3, 1), 3 - 1, 'curry with ary 2'),
  t => t.equal(subN3(3, 1, 1), 3 - 1 - 1, 'curry with ary 3'),
])

const { promisify } = require('util')
const fs = require('fs')

test('promisify proxy', [
  t => t.equal(c.fs.readFile, promisify(fs.readFile)),
])

const strA = '  a.b.c.d  '
test('proto proxy', [
  t => t.equal(c.proto.String.trim(strA), strA.trim(),
    'calling a method with no arguments as a function'),

  t => t.equal(c.proto.String.indexOf('a', strA), strA.indexOf('a'),
    'calling a method with 1 argument as a function'),

  t => t.equal(c.proto.String.indexOf('a')(strA), strA.indexOf('a'),
    'calling a method with 1 argument as a curryfied function'),
])

test('compose pipe', [
  t => t.equal(c.pipe([ c.proto.String.indexOf('a') ])(strA), strA.indexOf('a'),
    '1 function'),

  t => t.equal(c.pipe([ c.proto.String.indexOf('a'), add4 ])(strA), strA.indexOf('a') + 4,
    '2 functions'),

  t => t.equal(c.pipe([ c.proto.String.indexOf('a'), add4, n => n**2 ])(strA), (strA.indexOf('a') + 4)**2,
    '3 functions'),
])

test('compose fast (eval)', [
  t => t.equal(c.fast([ c.proto.String.indexOf('a') ])(strA), strA.indexOf('a'),
    '1 function'),

  t => t.equal(c.fast([ c.proto.String.indexOf('a'), add4 ])(strA), strA.indexOf('a') + 4,
    '2 functions'),

  t => t.equal(c.fast([ c.proto.String.indexOf('a'), add4, n => n**2 ])(strA), (strA.indexOf('a') + 4)**2,
    '3 functions'),
])

test('compose c', [
  t => c([ c.proto.String.indexOf('a') ])(strA)
    .then(value =>t.equal(value, strA.indexOf('a'), '1 function')),

  t => c([ c.proto.String.indexOf('a'), add4 ])(strA)
    .then(value =>t.equal(value, strA.indexOf('a') + 4, '2 functions')),

  t => c([ c.proto.String.indexOf('a'), add4, n => n**2 ])(strA)
    .then(value =>t.equal(value, (strA.indexOf('a') + 4)**2, '3 functions')),
])

test('compose c - catch', [
  t => c([ () => pouet++, c.catch(err => err.message) ])(strA)
    .then(value => t.equal(value, 'pouet is not defined', 'catch synchronous errors')),

  t => c([ () => Promise.reject(Error('pouet')), c.catch(err => err.message) ])(strA)
    .then(value => t.equal(value, 'pouet', 'catch asynchronous errors')),
])
