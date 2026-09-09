// Simple in-memory rate limiter สำหรับ public API
// สำหรับ Production ขนาดใหญ่ ควรใช้ Upstash Redis แทน

interface RateRecord {
  count: number
  resetAt: number
}

const store = new Map<string, RateRecord>()

// ล้าง expired entries ทุก 5 นาที
let lastClean = Date.now()
function maybeclean() {
  const now = Date.now()
  if (now - lastClean < 5 * 60 * 1000) return
  lastClean = now
  store.forEach((record, key) => {
    if (record.resetAt < now) store.delete(key)
  })
}

/**
 * @param key - unique identifier (IP หรือ License key)
 * @param limit - max requests
 * @param windowMs - time window in milliseconds
 * @returns true = allowed, false = rate limited
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  maybeclean()
  const now = Date.now()
  const record = store.get(key)

  if (!record || record.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (record.count >= limit) return false

  record.count++
  return true
}
