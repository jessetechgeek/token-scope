const Fastify = require('fastify')
const app = require('../dist/app').default

// Never called: lets Vercel's file tracer ship dependencies that autoload
// and dynamic import() pull in at runtime.
const traced = () => [require('fastify-plugin'), require('@fastify/sensible'), require.resolve('postgres')]
void traced

const server = Fastify({ logger: true })
server.register(app)

module.exports = async (req, res) => {
  await server.ready()
  server.server.emit('request', req, res)
}
