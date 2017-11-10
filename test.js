const { readdirSync } = require('fs')

readdirSync('.')
  .filter(file => /\.test\.js$/.test(file))
  .forEach(file => require(`./${file}`))
