const { throwMessage } = require('./4k')

const oneOf = list => val => list.includes(val)
  ? val
  : throwMessage(val + ' must be one of '+ list.join(', '))

const between = (min, max) => val => {
  val = Number(val)
  if (val >= min && val <= max) return val
  throw Error(`value ${val} must be between ${min} and ${max}`)
}

const required = fn => val => val == undefined
  ? throwMessage('required param')
  : fn(val)

const optional = fn => val => val == undefined ? val : fn(val)


module.exports = {
  oneOf,
  between,
  optional,
  required,
}
