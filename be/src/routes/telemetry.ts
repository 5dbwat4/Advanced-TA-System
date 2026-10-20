import type { FastifyPluginAsync } from 'fastify'

import { checkRateLimit } from '../lib/rate-limit.js'

const SENTRY_ENVELOPE_URL =
  'https://o4512288917749760.ingest.us.sentry.io/api/4512288934133760/envelope/'
const MAX_ENVELOPE_BYTES = 1024 * 1024

export const telemetryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addContentTypeParser(
    'application/x-sentry-envelope',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  )

  fastify.get('/', async (_request, reply) => {
    return reply.header('cache-control', 'no-store').send({
      message:
        'Ἔχομεν δὲ τὸν θησαυρὸν τοῦτον ἐν ὀστρακίνοις σκεύεσιν· ἐτέθην ἐγὼ κῆρυξ. / But we have this treasure in earthen vessels; I was appointed a herald.',
    })
  })

  fastify.post('/', { bodyLimit: MAX_ENVELOPE_BYTES }, async (request, reply) => {
    const { ok, retryAfterSec } = checkRateLimit(`telemetry:${request.ip}`, {
      windowMs: 60_000,
      max: 300,
    })
    if (!ok) {
      return reply
        .code(429)
        .header('Retry-After', String(retryAfterSec))
        .send({ error: 'RATE_LIMITED' })
    }

    if (!Buffer.isBuffer(request.body)) {
      return reply.code(400).send({ error: 'INVALID_BODY' })
    }

    const headers: Record<string, string> = {
      'content-type': 'application/x-sentry-envelope',
    }
    const encoding = request.headers['content-encoding']
    if (typeof encoding === 'string') headers['content-encoding'] = encoding

    try {
      const upstream = await fetch(SENTRY_ENVELOPE_URL, {
        method: 'POST',
        headers,
        body: request.body,
        signal: AbortSignal.timeout(5000),
      })
      return reply.code(upstream.status).send()
    } catch (error) {
      request.log.warn({ err: error }, 'sentry tunnel forward failed')
      return reply.code(502).send({ error: 'UPSTREAM_FAILED' })
    }
  })
}
