const test = require('./tester')
const c = require('./4k')

const add = (a, b) => a + b
const addCurry = c.curry(add)
const add4 = addCurry(4)
const subDefaults = (a = 0, b = 0, c = 0) => a - b - c
const subN2 = c.curry(subDefaults, 2)
const subN3 = c.curry(subDefaults, 3)

test('4k curry', [
  t => t.equal(addCurry(4, 4), add(4, 4), 'normal call'),
  t => t.equal(add4(4), add(4, 4), 'curry call'),
  t => t.equal(add4(10), add(4, 10), 'curry successive call'),
  t => t.equal(subN2(3, 1), 3 - 1, 'curry with ary 2'),
  t => t.equal(subN3(3, 1, 1), 3 - 1 - 1, 'curry with ary 3'),
  t => t.equal(subN2, c.curry(subDefaults, 2),
    'curry successive times a function should return the same function'),
])

const { promisify } = require('util')
const fs = require('fs')

test('4k promisify proxy', [
  t => t.equal(c.fs.readFile, promisify(fs.readFile)),
])

const strA = '  a.b.c.d  '
test('4k proto proxy', [
  t => t.equal(c.proto.String.trim(strA), strA.trim(),
    'calling a method with no arguments as a function'),

  t => t.equal(c.proto.String.indexOf('a', strA), strA.indexOf('a'),
    'calling a method with 1 argument as a function'),

  t => t.equal(c.proto.String.indexOf('a')(strA), strA.indexOf('a'),
    'calling a method with 1 argument as a curryfied function'),

  t => t.deepEqual(c.proto.String.split('.', 1)(strA), strA.split('.', 1),
    'calling a method with 2 argument as a function'),

  t => t.deepEqual(c.proto.String.split('.')(1)(strA), strA.split('.', 1),
    'calling a method with 2 argument as a curryfied function'),

  t => t.deepEqual(c.proto.String.split('.')()(strA), strA.split('.'),
    'empty calls should skip one argument'),

  t => t.deepEqual(c.proto.String.split()()(strA), strA.split(),
    'empty 2 calls should skip 2 arguments'),
])

test('4k compose pipe', [
  t => t.equal(c.pipe([ c.proto.String.indexOf('a') ])(strA), strA.indexOf('a'),
    '1 function'),

  t => t.equal(c.pipe([ c.proto.String.indexOf('a'), add4 ])(strA), strA.indexOf('a') + 4,
    '2 functions'),

  t => t.equal(c.pipe([ c.proto.String.indexOf('a'), add4, n => n**2 ])(strA), (strA.indexOf('a') + 4)**2,
    '3 functions'),
])

test('4k fold', [
  t => t.equal(c.fold((a, b) => a + b, 0, [ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold((a, b) => a + b)(0, [ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold((a, b) => a + b, 0)([ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold((a, b) => a + b)(0)([ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold.Array((a, b) => a + b, 0, [ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold.Array((a, b) => a + b)(0, [ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold.Array((a, b) => a + b, 0)([ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold.Array((a, b) => a + b)(0)([ 1, 2, 3, 4]), 10),
  t => t.equal(c.fold((x, f, i) => `f${i}(${x})`, 'x', [ 1, 2, 3, 4 ]), 'f3(f2(f1(f0(x))))')
])

test('4k map', [
  t => t.deepEqual(c.map((f, i) => `f${i}`, [ 1, 2, 3, 4 ]), [ 'f0', 'f1', 'f2', 'f3' ]),
  t => t.deepEqual(c.map.Array((f, i) => `f${i}`, [ 1, 2, 3, 4 ]), [ 'f0', 'f1', 'f2', 'f3' ]),
])

const defaultValues = { a: 1, b: { c: 2, d: { e: 5 } } }
test('4k defaults', [
  t => t.deepEqual(c.defaults({ a: 4 }, defaultValues),
    { a: 4, b: { c: 2, d: { e: 5 } } }, 'Should copy values without overriding'),
  t => t.equal(c.defaults({ a: 4 }, defaultValues).b,
    defaultValues.b, 'Shallow copied object should share ref'),
])

test('4k defaults.deep', [
  t => t.deepEqual(c.defaults.deep({ a: 4 }, defaultValues),
    { a: 4, b: { c: 2, d: { e: 5 } } }, 'Should copy values without overriding'),
  t => t.notEqual(c.defaults.deep({ a: 4 }, defaultValues).b,
    defaultValues.b, 'Deep copied object should not share ref'),
  t => t.notEqual(c.defaults.deep({ a: 4 }, defaultValues).b.d,
    defaultValues.b.d, 'Copied nested object should not share ref'),
  t => t.deepEqual(c.defaults.deep({ a: 4, b: { d: { f: 6 } } },
    defaultValues).b.d, { e: 5, f: 6 }, 'Should preserve nested values'),
])

test('4k compose fast (eval)', [
  t => t.equal(c.fast([ c.proto.String.indexOf('a') ])(strA), strA.indexOf('a'),
    '1 function'),

  t => t.equal(c.fast([ c.proto.String.indexOf('a'), add4 ])(strA), strA.indexOf('a') + 4,
    '2 functions'),

  t => t.equal(c.fast([ c.proto.String.indexOf('a'), add4, n => n**2 ])(strA), (strA.indexOf('a') + 4)**2,
    '3 functions'),
])

test('4k compose c', [
  t => c([ c.proto.String.indexOf('a') ])(strA)
    .then(value =>t.equal(value, strA.indexOf('a'), '1 function')),

  t => c([ c.proto.String.indexOf('a'), add4 ])(strA)
    .then(value =>t.equal(value, strA.indexOf('a') + 4, '2 functions')),

  t => c([ c.proto.String.indexOf('a'), add4, n => n**2 ])(strA)
    .then(value =>t.equal(value, (strA.indexOf('a') + 4)**2, '3 functions')),
])

test('4k compose c - catch', [
  t => c([ () => pouet++, c.catch(err => err.message) ])(strA)
    .then(value => t.equal(value, 'pouet is not defined', 'catch synchronous errors')),

  t => c([ () => Promise.reject(Error('pouet')), c.catch(err => err.message) ])(strA)
    .then(value => t.equal(value, 'pouet', 'catch asynchronous errors')),
])

test('4k all', [
  t => c.all({ a: 1, b: Promise.resolve(2), c: Promise.resolve(3) })
    .then(value => t.deepEqual(value, { a: 1, b: 2, c: 3 }), 'resolve mixed object'),

  t => c.all([ 1, Promise.resolve(2), Promise.resolve(3) ])
    .then(value => t.deepEqual(value, [ 1, 2, 3 ]), 'resolve arrays'),
])

test('4k to (access proxy)', [
  t => t.equal(c.to.a.b.c({ a: { b: { c: add4 } } }), add4),
])

//*/
