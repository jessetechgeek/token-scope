import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hourlyTier, pickSource, pickTier } from '../../src/lib/queries'

test('pickTier defaults to 30 days served from the daily rollup', () => {
  const tier = pickTier()
  assert.equal(tier.windowMs, 30 * 86_400_000)
  assert.equal(tier.servedFrom, 'spend_1h')
  assert.equal(tier.unit, 'day')
  assert.equal(tier.rollup, true)
})

test('pickTier reads raw rows for the last hour and rollups beyond it', () => {
  assert.deepEqual(
    [pickTier('1h').servedFrom, pickTier('1h').rollup, pickTier('1h').bucketSeconds],
    ['api_requests', false, 60],
  )
  for (const range of ['24h', '7d', '30d', '90d']) {
    assert.equal(pickTier(range).servedFrom, 'spend_1h', range)
    assert.equal(pickTier(range).rollup, true, range)
  }
  assert.equal(pickTier('24h').unit, 'hour')
  assert.equal(pickTier('7d').unit, 'hour')
  assert.equal(pickTier('90d').windowMs, 90 * 86_400_000)
})

test('pickTier rejects unknown ranges with a 400', () => {
  assert.throws(() => pickTier('1y'), (error: Error & { statusCode?: number }) => error.statusCode === 400)
})

test('hourlyTier forces an hourly rollup and leaves rollup tiers alone', () => {
  const raw = hourlyTier(pickTier('1h'))
  assert.equal(raw.servedFrom, 'spend_1h')
  assert.equal(raw.bucketSeconds, 3600)
  assert.equal(raw.unit, 'hour')
  assert.equal(raw.rollup, true)
  assert.equal(raw.windowMs, 3_600_000)

  const daily = pickTier('30d')
  assert.equal(hourlyTier(daily), daily)
})

test('pickSource defaults to live and rejects anything else', () => {
  assert.equal(pickSource(), 'live')
  assert.equal(pickSource('live'), 'live')
  assert.throws(() => pickSource('import'), (error: Error & { statusCode?: number }) => error.statusCode === 400)
})
