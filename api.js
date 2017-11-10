const { lazyProxy, isFn } = require('./4k')
const request = require('./request')
const methods = Object.create(null)

Object.keys(request.extend([]))
  .forEach(method => methods[method] = request.setOpt('method', method.toUpperCase()))

module.exports = api => {
  isFn(api) || (api = request.use(api))

  const next = (path, method) => lazyProxy(key => next(`${path}/${key}`, method),
    request.extendWithoutMethods([
      api,
      method,
      request.setOpt('path', path),
    ]))

  return lazyProxy(method => next('', methods[method]))
}
