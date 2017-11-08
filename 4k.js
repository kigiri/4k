const isNode = typeof global !== 'undefined'
if (!isNode) {
  const g = typeof window === 'undefined' ? self : window
  g.global = g
}
const isFn = fn => typeof fn === 'function'
const isArr = Array.isArray || (arr => arr && arr.constructor === Array)
const isDef = val => val !== undefined
const isNum = num => typeof num === 'number' && !isNaN(num)
const isBool = b => b === true || b === false
const isObj = obj => obj && (typeof obj === 'object')
const isStr = str => typeof str === 'string'
const isUndef = val => val === undefined
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
  while (i) {
    arguments[i] = arguments[--i]
  }
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
  const args = Object.create(null)
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

const fmemo = maker => {
  const S = Symbol()
  return fn => fn[S] || (fn[S] = maker(fn))
}

const curry = (fn, ary) => {
  ary || (ary = fn.length)
  if (ary === 1) return fn
  function curryfier(args, traceSource) {
    if (args.length >= ary) {
      try { return fn.apply(null, args) }
      catch (err) {
        Error.captureStackTrace(err, traceSource)
        throw err
      }
    }
    return function _cu() { return curryfier(mergeArgs(args, arguments), _cu) }
  }
  return function _fn() { return curryfier(arguments, _fn) }
}

const metaProxy = (maker, s=Object.create(null)) => new Proxy(s, {
  get: (src, key) => src[key] || (src[key] = maker(key, src)),
})

const functify = (method, ary = method.length + 1) =>
  curry(thisIsLast(method), ary)

const proto = metaProxy(type => metaProxy(methodKey =>
  functify(global[type].prototype[methodKey])))

const objectPromiseAll = (obj, store) => {
  const keys = Object.keys(obj)
  const work = Array(keys.length)
  let i = -1

  while (++i < keys.length) {
    work[i] = obj[keys[i]]
  }

  return Promise.all(work).then(result => {
    i = -1

    while (++i < keys.length) {
      store[keys[i]] = result[i]
    }

    return store
  })
}

const _S = Symbol('@@Success')
const _F = Symbol('@@Failure')
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
  while (++i < fns.length) { arg = fns[i](arg) }
  return arg
})

const noOp = () => {}
const passFirst = (a, b) => isThenable(a) ? a.then(() => b) : b
const passBoth = (a, b) => (isThenable(a) || isThenable(b))
  ? Promise.all([ b, a ])
  : [ b, a ]

const hold = curry((fn, a) => passFirst(fn(a), a))
hold.both = curry((fn, a) => passBoth(fn(a), a))
hold.get = (p, ...fns) => hold(pipe(path(p), fns))
hold.map = curry((fn1, fn2, a) => passBoth(fn1(a), fn2(a)))
const fold = functify(Array.prototype.reduce, 3)
functify.proto = type => (methodKey, ary) =>
  functify(type.prototype[methodKey], ary)

module.exports = Object.assign(c, {
  c, // sync and asnyc + error handling, aka "Ceci n'est pas une pipe"
  pipe, // simplest, 0 overhead, sync only
  fast: ((_body, _args) => fns => // fastest pipe, small overhead with eval, no curry
    Function(_args(fns), `return x => ${_body(fns)}`)(...fns))
  (fold((x, f, i) => `f${i}(${x})`, 'x'), proto.Array.map((f, i) => `f${i}`)),
  // Isomorphic Promise.all
  all:  trace(collection => {
    if (!collection) return Promise.resolve(collection)
    return Array.isArray(collection)
      ? Promise.all(collection)
      : objectPromiseAll(collection, Object.create(null))
  }),
  g: (get => {
    const options = fn => ({
      get: (src, key) => src[key] || (src[key] = new Proxy(fn(key, src), opts)),
    })
    const opts = options((key, src) => target => get(src(target), key))
    return new Proxy({}, options(key => target => get(target, key)))
  })((src, key) => src && src[key]),
  map: proto.Array.map,
  sort: proto.Array.sort,
  filter: proto.Array.filter,
  reduce: proto.Array.reduce, // reduce only take 1 arguments, will fail on empty array
  fold, // Use fold to reduce with initial value, works with empty arrays
  noOp,
  hold,
  proto, // lazy proxy to get a functified function (see functify)
  trace, // usefull for clutterless errors (skip internals stack trace)
  fmemo, // stupid simple memozation for f -> f
  flatten, // recursive array flatten, copy only if needed
  functify, // allow to use a method as a currified function
            // the this argument will be the last parameter
  // call the given function with this as first argument
  this: fmemo(fn => function () {
    let i = arguments.length
    while (i) {
      arguments[i] = arguments[--i]
    }
    arguments[0] = this
    arguments.length++
    return fn.apply(null, arguments)
  }),
  catch: f => ({ [_F]: f }),
  then: (s, f) => ({ [_S]: s, [_F]: f }),
  exec: (key, ...args) => (el, ...rest) => el[key](...args, ...rest),
  join: (...args) => args,
  return: a => () => a,
  spread: fmemo(fn => (...args) => fn(...flatten(args))),
  spreadMap: fmemo(fn => map((...args) => fn(...flatten(args)))),
  lazy: fmemo(fn => val => () => fn(val)),
  cook: (fn, ...args) => (...rest) => fn(...args, ...rest),
  delay: n => val => new Promise(s => setTimeout(() => s(val), n)),
  _1: fmemo(fn => a => fn(a)),
  _2: fmemo(fn => (a, b) => fn(b)),
  _3: fmemo(fn => (a, b, c) => fn(c)),
  _n: n => (...args) => args[n+1],
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
})
