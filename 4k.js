const isNode = typeof global !== 'undefined'
if (!isNode) {
  const g = typeof window === 'undefined' ? self : window
  g.global = g
}

// Use objects as HashMap
const H = () => Object.create(null)
H.from = props => Object.assign(H(), props)
const id = x => x
const noOp = () => {}

// shared symbols
const _S = Symbol('@@Success')
const _F = Symbol('@@Failure')
const _U = Symbol('@@Uncurry')

const isFn = fn => typeof fn === 'function'
const isArr = Array.isArray
const isDef = val => val != null
const isNum = num => typeof num === 'number' && !isNaN(num)
const isBool = b => b === true || b === false
const isObj = obj => obj && (typeof obj === 'object')
const isStr = str => typeof str === 'string'
const isUndef = val => val == null
const isThenable = fn => fn && isFn(fn.then)
const isPrimitive = prim => {
  switch (typeof prim) {
    case 'string':
    case 'number':
    case 'boolean': return true
    default: return false
  }
}

const thisIsLast = fn => function () {
  let i = arguments.length - 1
  if (i < 1) return fn.apply(arguments[0])
  const last = arguments[i]
  arguments.length--
  return fn.apply(last, arguments)
}

// Wrap a function in a trace that will limit the stack from it
const trace = fn => function tracer() {
  try { return fn.apply(this, arguments) }
  catch (err) {
    Error.captureStackTrace(err, tracer)
    throw err
  }
}

const slice = (arr, n, i) => Array.prototype.slice.call(arr, n, i)
const flattenArray = (arr, i, result) => {
  while (++i < arr.length) {
    if (Array.isArray(arr[i])) {
      flattenArray(arr[i], -1, result)
    } else {
      result.push(arr[i])
    }
  }
  return result
}

const flatten = arr => {
  let i = -1
  while (++i < arr.length) {
    if (Array.isArray(arr[i])) {
      const result = slice(arr, 0, i)
      flattenArray(arr[i], -1, result)
      return flattenArray(arr, i, result)
    }
  }
  return arr
}

const mergeArgs = (a, b) => {
  const start = a.length
  const max = start + b.length

  if (start === max) return a
  const args = {}
  args.length = max

  let i = -1
  while (++i < start) {
    args[i] = a[i]
  }

  while (i < max) {
    args[i] = b[i - start]
    ++i
  }

  return args
}

const fmemo = (maker, S = Symbol()) => fn => fn[S] || (fn[S] = maker(fn))
const uncurry = fn => fn && fn[_U] || fn
function curryfier(ary, fn, args, traceSource) {
  if (args.length >= ary) {
    try { return fn.apply(null, args) }
    catch (err) {
      Error.captureStackTrace(err, traceSource)
      throw err
    }
  }
  return function _cu() {
    arguments.length || (arguments.length = 1) // empty calls skip next argument
    return curryfier(ary, fn, mergeArgs(args, arguments), _cu)
  }
}

const curry = (symbols => (fn, ary) => {
  ary || (ary = fn.length)
  if (ary === 1) return fn
  const __s = symbols[ary]
  if (fn[__s]) return fn[__s]
  function _fn() {
    arguments.length || (arguments.length = 1)
    return curryfier(ary, fn, arguments, _fn)
  }
  _fn[_U] = fn
  return fn[__s] = _fn
})(Array(9).fill().reduce((s, _, i) => (s[i + 2] = Symbol(`@@${i+2}`), s), H()))

const lazyProxy = (maker, s=H()) => new Proxy(s, {
  get: trace((src, key) => key in src
    ? src[key]
    : (src[key] = isStr(key) ? maker(key, src) : undefined)), // ignore Symbols
})

const functify = (method, ary = method && method.length + 1) =>
  curry(thisIsLast(method), ary)

functify.proto = type => (methodKey, ary) =>
  functify(type.prototype[methodKey], ary)

const proto = lazyProxy(type => lazyProxy(methodKey => global[type][methodKey]
  ? curry(global[type][methodKey])
  : functify(global[type].prototype[methodKey])))

const lazy = fmemo(fn => a => () => fn(a))

const to = (get => {
  const options = fn => ({
    get: (src, key) => src[key] || (src[key] = new Proxy(fn(key, src), opts)),
  })
  const opts = options((key, src) => target => get(src(target), key))
  return new Proxy({}, options(key => target => get(target, key)))
})((src, key) => src && src[key])

const fromKeys = (keys, result, store) => {
  let i = -1

  while (++i < keys.length) {
    store[keys[i]] = result[i]
  }

  return store
}

const objectPromiseAll = x => Promise.all(Object.values(x))
  .then(values => fromKeys(Object.keys(x), values, {}))

proto.Object.first = obj => obj[Object.keys(obj)[0]]
proto.Object.forEach = curry((fn, obj) => {
  const keys = Object.keys(obj)
  for (let key of keys) fn(key, obj[key])
  return obj
})

const constructorName = val => {
  if (!val) return ''
  switch (val.constructor) {
    case undefined:
    case null: return 'Object'
    default: return val.constructor.name
  }
}

const match = (actions, getter = id) => {
  const patterns = H()
  const matcher = curry(function () {
    const action = patterns[getter.apply(this, arguments)]
    return action && action.apply(this, arguments)
  }, uncurry(proto.Object.first(actions)).length)

  proto.Object.forEach((key, action) => {
    patterns[key] = uncurry(action)
    matcher[key] = action
  }, actions)

  return matcher
}

const copyArrayToString = obj => (obj.String = obj.Array, obj)
const fold = match(copyArrayToString({
  Set: proto.Set.fold = curry((fn, acc, s) => {
    for (let val of s) acc = fn(acc, val, s)
    return acc
  }),
  Map: proto.Map.fold = curry((fn, acc, m) => {
    for (let [ key, val ] of m) acc = fn(acc, val, key, s)
    return acc
  }),
  Object: proto.Object.fold = curry((fn, acc, obj) => {
    const keys = Object.keys(obj)
    for (let key of keys) acc = fn(acc, obj[key], key, obj)
    return acc
  }),
  Array: proto.Array.fold = functify(Array.prototype.reduce, 3),
}), (fn, acc, collection) => constructorName(collection))

const map = match(copyArrayToString({
  Set: proto.Set.map = curry((fn, s) => {
    const result = new Set
    for (let val of s) result.add(fn(val, s))
    return result
  }),
  Map: proto.Map.map = curry((fn, m) => {
    const result = new Map
    for (let [ key, val ] of m) result.set(key, fn(val, key, s))
    return result
  }),
  Object: proto.Object.map = curry((fn, obj) => {
    const keys = Object.keys(obj)
    const result = {}
    for (let key of keys) result[key] = fn(obj[key], key, obj)
    return result
  }),
  Array: proto.Array.map,
}), (fn, collection) => constructorName(collection))

const buildChain = (prev, next) => typeof next === 'function'
  ? arg => {
    const val = prev(arg)
    return isThenable(val) ? val.then(next) : next(val)
  }
  : arg => {
    try {
      const val = prev(arg)
      return isThenable(val) ? val.then(next[_S], next[_F]) : next[_S](val)
    } catch (err) { return next[_F](err) }
  }

const toPromise = q => isThenable(q) ? q : Promise.resolve(q)
const c = fns => {
  fns.push(toPromise)
  return fns.reduce(buildChain)
}

const pipe = curry((fns, arg) => {
  let i = -1
  while (++i < fns.length) { arg = fns[i](arg) }
  return arg
})

const passFirst = (a, b) => isThenable(a) ? a.then(() => b) : b
const passBoth = (a, b) => (isThenable(a) || isThenable(b))
  ? Promise.all([ b, a ])
  : [ b, a ]

const hold = curry((fn, a) => passFirst(fn(a), a))
hold.both = curry((fn, a) => passBoth(fn(a), a))
hold.get = (p, ...fns) => hold(pipe(path(p), fns))
hold.map = curry((fn1, fn2, a) => passBoth(fn1(a), fn2(a)))

let promisify
if (isNode) {
  const util = require('util')
  promisify = fmemo(util.promisify, util.promisify.custom)
  c[util.inspect.custom] = lazy(Object.values)(value => value instanceof Proxy)()
} else {
  promisify = fmemo(fn => (...args) => new Promise((s,f) => fn(...args, (err, ...data) => {
    if (err) return f(err)
    return data.length > 1 ? s(data) : s(data[0])
  })))
}
const prototypes = 'Array.Number.String.Boolean.Object'
  .split('.')
  .forEach(key => c[key.slice(0,3).toLowerCase()] = c[key] = proto[key])

c.obj.fromKeys = fromKeys
const copy = (actions => val =>
  (actions[constructorName(val)] || actions.defaults)(val))(H.from({
  Set: val => new Set(val),
  Map: val => new Map(val),
  Array: val => val.map(copy),
  Object: val => map.Object(copy, val),
  defaults: id,
}))

const defaults = fold.Object((acc, val, key) =>
  (isUndef(acc[key]) && (acc[key] = val), acc))

defaults.deep = fold.Object((acc, val, key) => {
  if (!acc[key]) {
    acc[key] = copy(val)
  } else if (isObj(acc[key])) {
    defaults.deep(acc[key], val)
  }
  return acc
})
const throwMessage = message => {
  const err = Error(message)
  Error.captureStackTrace(err, throwMessage)
  throw err
}

module.exports = lazyProxy(moduleKey => {
  try {
    const mod = require(moduleKey)
    return lazyProxy(key => promisify(mod[key]))
  } catch (err) { }
}, Object.assign(c, {
  c, // sync and asnyc + error handling, aka "Ceci n'est pas une pipe"
  pipe, // simplest, 0 overhead, sync only
  fast: ((_args, _body) => fns => // fastest pipe, small overhead with eval, no curry
    Function(_args(fns), `return x => ${_body(fns)}`)(...fns))
  (map.Array((f, i) => `f${i}`), fold.Array((x, f, i) => `f${i}(${x})`, 'x')),
  // Isomorphic Promise.all
  all:  trace(collection => {
    if (!collection) return Promise.resolve(collection)
    return Array.isArray(collection)
      ? Promise.all(collection)
      : objectPromiseAll(collection)
  }),
  // access functions, to.pouet.lol === src => src && src.pouet && src.pouet.lol
  to,
  H, // Object.create(null) alias
  map,
  fold, // Use fold to reduce with initial value, works with empty arrays
  sort: proto.Array.sort,
  filter: proto.Array.filter,
  reduce: proto.Array.reduce, // reduce only take 1 arguments, will fail on empty array
  hold,
  curry,
  proto, // lazy proxy to get a functified function (see functify)
  trace, // usefull for clutterless errors (skip internals stack trace)
  fmemo, // stupid simple memozation for f -> f
  flatten, // recursive array flatten, copy only if needed
  defaults, // like assign but preserve target values
  functify, // allow to use a method as a currified function
            // the this argument will be the last parameter
  // call the given function with this as first argument
  lazyProxy, // Use proxy for lazy programming
  this: fmemo(fn => function () {
    let i = arguments.length
    while (i) {
      arguments[i] = arguments[--i]
    }
    arguments[0] = this
    arguments.length++
    return fn.apply(null, arguments)
  }),
  catch: fmemo(f => ({ [_F]: f })),
  then: (s, f) => ({ [_S]: s, [_F]: f }),
  exec: (key, ...args) => (el, ...rest) => el[key](...args, ...rest),
  join: (...args) => args,
  return: a => () => a,
  spread: fmemo(fn => (...args) => fn(...flatten(args))),
  spreadMap: fmemo(fn => map((a, i, arr) => fn(...a, i, arr))),
  lazy,
  lazy2: fmemo(fn => curry((a, b) => () => fn(a, b))),
  lazy3: fmemo(fn => curry((a, b, c) => () => fn(a, b, c))),
  lazyN: fmemo(fn => (...args) => () => fn(...args)),
  cook: (fn, ...args) => (...rest) => fn(...args, ...rest),
  delay: n => a => new Promise(s => setTimeout(() => s(a), n)),
  _1: fmemo(fn => a => fn(a)),
  _2: fmemo(fn => (a, b) => fn(b)),
  _3: fmemo(fn => (a, b, c) => fn(c)),
  _n: n => (...args) => args[n+1],
  throw: throwMessage,
  throwMessage,
  throwError: err => { throw err },
  isFn,
  isArr,
  isDef,
  isNum,
  isBool,
  isObj,
  isStr,
  isUndef,
  isThenable,
  isPrimitive,
  id, // x => x
  noOp, // () => {}
}))
