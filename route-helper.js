const oneOf = list => val => {
  if (list.includes(val)) return val
  throw Error(val + ' must be one of '+ list.join(', '))
}

const between = (min, max) => val => {
  val = Number(val)
  if (val >= min && val <= max) return val
  throw Error(`value ${val} must be between ${min} and ${max}`)
}

const required = fn => val => {
  if (val === undefined) throw Error('required param')
  return fn(val)
}

const optional = fn => val => val === undefined ? val : fn(val)

module.exports = {
  oneOf,
  between,
  optional,
  required,
}
