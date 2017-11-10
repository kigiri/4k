const { lazyProxy, isFn } = require('./4k')
const request = require('./request')
const methods = Object.create(null)

Object.keys(request.extend([]))
  .forEach(method => methods[method] = request.setOpt('method', method.toUpperCase()))

module.exports = api => {
  isFn(api) || (api = request.use(api))

  const next = (basePath, path) => {
    const setMethod = methods[path]
    return lazyProxy(key => next(`${basePath}/${path}`, key), setMethod
      ? request.extendWithoutMethods([
          api,
          setMethod,
          request.setOpt('path', basePath),
        ])
      : {})
  }
  return lazyProxy(key => next('', key))
}
