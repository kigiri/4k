const { lazyProxy, isFn } = require('./4k')
const request = require('./request')
const methods = new Set(Object.keys(request.extend([])))

module.exports = api => {
  isFn(api) || (api = request.use(api))

  const next = (basePath, path) => {
    const valid = methods.has(path)
    const fn = request.extendWithoutMethods([
      api,
      valid && request.setOpt('method', path.toUpperCase()),
      request.setOpt('path', valid ? basePath : `${basePath}/${path}`),
    ].filter(Boolean))
    return lazyProxy(key => next(`${basePath}/${path}`, key), fn)
  }
  return lazyProxy(key => next('', key))
}
