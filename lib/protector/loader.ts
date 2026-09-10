/**
 * Loader Generator — Server Only
 *
 * สร้าง Loader.lua สำหรับ GameGuardian บน Android
 * Loader มีเฉพาะ: protection_id, api_endpoint, license_key
 * ไม่มี encryption key หรือ source ใดๆ
 *
 * Loader Flow (v2 — chunk streaming):
 *   1. DEVICE_ID ดึงจาก gg.getTargetInfo() อัตโนมัติ
 *   2. Anti-hook check — ตรวจ gg.* ถูก hook หรือไม่ก่อนทุก call
 *   3. POST /api/runtime/session → ได้ session_token
 *   4. POST /api/runtime/payload + session_token → ได้ chunks[] + checksum + count
 *   5. สร้าง source ว่าง, วน decode ทีละ chunk:
 *        chunk_plain = XOR(b64decode(chunks[i]), deriveChunkKeystream(token, i, len))
 *        source = source .. chunk_plain
 *        chunk_plain = nil; collectgarbage()   ← clear plaintext window ทันที
 *   6. ตรวจ checksum: SHA256(token .. source) → first 8 bytes → 16 hex chars
 *   7. load(source)()
 *   8. source = nil; collectgarbage()         ← wipe source หลัง execute
 *
 * Security hardening (v2):
 *   Anti-hook  : ตรวจ type(gg.makeRequest) == "function" ก่อนทุก network call
 *                ถ้า hook detected → abort ทันที
 *   Chunk nil  : xored_chunk ถูก nil'd และ GC'd ทันทีหลัง concat
 *                → plaintext window สูงสุด CHUNK_SIZE (512) bytes ในแต่ละรอบ
 *   Post-exec wipe: source nil'd และ GC'd หลัง fn() return
 *   No globals : fn เก็บใน local, ไม่ expose ออก global scope
 *
 * Keystream alignment (CRITICAL — ต้องตรงกับ engine.ts deriveChunkKeystream):
 *   Server: SHA256(seed || "chunk" || uint32BE(index) || counter_lo || counter_hi)
 *   Lua:    sha256(seed .. "chunk" .. uint32be(index) .. char(ctr&0xff, ctr>>8&0xff))
 *   Unit: ทั้งคู่ใช้ chunkIndex เป็น uint32 big-endian 4 bytes
 *
 * Checksum alignment (ต้องตรงกับ engine.ts prepareDeliveryChunks):
 *   Server: SHA256(sessionToken || obfuscated_source_bytes) → first 8 bytes → 16 hex
 *   Lua:    sha256(token .. assembled_source) → bytes 1..8 → "%02x" → 16 chars
 */

export interface LoaderConfig {
  protectionId: string
  originalFilename: string
  apiEndpoint: string   // e.g. "https://your-app.vercel.app"
  licenseKey: string
  createdAt: string
}

export function generateLoader(config: LoaderConfig): string {
  const { protectionId, originalFilename, apiEndpoint, licenseKey, createdAt } = config

  return `-- ============================================================
-- Loader: ${originalFilename}
-- Protection: ${protectionId}
-- Generated: ${createdAt}
-- Platform: GameGuardian (Android / Lua 5.3)
-- Version: 2 (chunk streaming + anti-hook)
-- ============================================================
-- คำเตือน: ไฟล์นี้สร้างโดยอัตโนมัติ ไม่ควรแก้ไข
-- ============================================================

local PROTECTION_ID = "${protectionId}"
local API_ENDPOINT  = "${apiEndpoint}"
local LICENSE_KEY   = "${licenseKey}"

-- DEVICE_ID ดึงจาก GameGuardian อัตโนมัติ
local DEVICE_ID = (function()
  local ok, info = pcall(function() return gg.getTargetInfo() end)
  if ok and info and info.packageName then
    return info.packageName .. "-" .. tostring(info.versionCode or "0")
  end
  return "unknown-device"
end)()

-- ============================================================
-- Anti-hook guard
-- ตรวจว่า gg.makeRequest ยังเป็น native function อยู่
-- ถ้าถูก hook (type เปลี่ยนหรือ tostring ไม่ขึ้น "function:")
-- → abort ทันที เพื่อป้องกัน MITM ของ payload
-- ============================================================
local function checkAntiHook()
  if type(gg) ~= "table" then
    gg.alert("[Loader] gg environment ผิดพลาด")
    os.exit()
  end
  -- gg.makeRequest ต้องเป็น function จาก native GG
  if type(gg.makeRequest) ~= "function" then
    gg.alert("[Loader] ตรวจพบการดัดแปลง (hook detected)")
    os.exit()
  end
  -- gg.toast ต้องเป็น function ด้วย
  if type(gg.toast) ~= "function" then
    gg.alert("[Loader] Environment ผิดปกติ")
    os.exit()
  end
end

-- ============================================================
-- SHA-256 (pure Lua 5.3 — native bitwise operators)
-- ============================================================
local sha256
do
  local function u32(n) return n & 0xffffffff end
  local function rotr(x, n) return u32((x >> n) | (x << (32 - n))) end

  local K = {
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  }

  sha256 = function(msg)
    local s = {0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19}
    local bits = #msg * 8
    msg = msg .. "\\x80"
    while #msg % 64 ~= 56 do msg = msg .. "\\x00" end
    local hi = (bits >> 32) & 0xffffffff
    local lo = bits & 0xffffffff
    msg = msg .. string.char(
      (hi >> 24) & 0xff, (hi >> 16) & 0xff, (hi >> 8) & 0xff, hi & 0xff,
      (lo >> 24) & 0xff, (lo >> 16) & 0xff, (lo >>  8) & 0xff, lo & 0xff)
    for i = 1, #msg, 64 do
      local w = {}
      for j = 1, 16 do
        local o = (i - 1) + (j - 1) * 4
        w[j] = u32(
          (msg:byte(o+1) << 24) |
          (msg:byte(o+2) << 16) |
          (msg:byte(o+3) <<  8) |
           msg:byte(o+4))
      end
      for j = 17, 64 do
        local s0 = rotr(w[j-15],7) ~ rotr(w[j-15],18) ~ (w[j-15] >> 3)
        local s1 = rotr(w[j-2],17) ~ rotr(w[j-2],19)  ~ (w[j-2]  >> 10)
        w[j] = u32(w[j-16] + s0 + w[j-7] + s1)
      end
      local a,b,c,d,e,f,g,h = table.unpack(s)
      for j = 1, 64 do
        local S1   = rotr(e,6) ~ rotr(e,11) ~ rotr(e,25)
        local ch   = (e & f) ~ (~e & g)
        local tmp1 = u32(h + S1 + ch + K[j] + w[j])
        local S0   = rotr(a,2) ~ rotr(a,13) ~ rotr(a,22)
        local maj  = (a & b) ~ (a & c) ~ (b & c)
        local tmp2 = u32(S0 + maj)
        h=g g=f f=e e=u32(d+tmp1) d=c c=b b=a a=u32(tmp1+tmp2)
      end
      s[1]=u32(s[1]+a) s[2]=u32(s[2]+b) s[3]=u32(s[3]+c) s[4]=u32(s[4]+d)
      s[5]=u32(s[5]+e) s[6]=u32(s[6]+f) s[7]=u32(s[7]+g) s[8]=u32(s[8]+h)
    end
    local r = ""
    for _, v in ipairs(s) do
      r = r .. string.char(
        (v >> 24) & 0xff,
        (v >> 16) & 0xff,
        (v >>  8) & 0xff,
         v        & 0xff)
    end
    return r
  end
end

-- ============================================================
-- Base64 decode
-- ============================================================
local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function b64decode(s)
  s = s:gsub("[^" .. B64 .. "=]", "")
  local r = ""
  for i = 1, #s, 4 do
    local n, pad = 0, 0
    for j = 0, 3 do
      local c = s:sub(i+j, i+j)
      if c == "=" then
        pad = pad + 1; n = n * 64
      else
        n = n * 64 + (B64:find(c, 1, true) - 1)
      end
    end
    r = r .. string.char((n >> 16) & 0xff)
    if pad < 2 then r = r .. string.char((n >> 8) & 0xff) end
    if pad < 1 then r = r .. string.char(n & 0xff) end
  end
  return r
end

-- ============================================================
-- uint32 big-endian → 4-byte string
-- ตรงกับ engine.ts: indexBuf.writeUInt32BE(chunkIndex, 0)
-- ============================================================
local function uint32be(n)
  return string.char(
    (n >> 24) & 0xff,
    (n >> 16) & 0xff,
    (n >>  8) & 0xff,
     n        & 0xff)
end

-- ============================================================
-- Per-chunk keystream derivation
-- ตรงกับ engine.ts deriveChunkKeystream(seed, chunkIndex, length):
--   SHA256(seed || "chunk" || uint32BE(index) || counter_lo || counter_hi)
-- ============================================================
local function deriveChunkKeystream(seed, chunkIndex, length)
  local indexBytes = uint32be(chunkIndex)
  local blocks, total, counter = {}, 0, 0
  while total < length do
    local block = sha256(seed .. "chunk" .. indexBytes ..
                         string.char(counter & 0xff, (counter >> 8) & 0xff))
    blocks[#blocks+1] = block
    total   = total + #block
    counter = counter + 1
  end
  return table.concat(blocks):sub(1, length)
end

-- ============================================================
-- Checksum verify
-- ตรงกับ engine.ts prepareDeliveryChunks:
--   SHA256(sessionToken || source) → bytes 0..7 → 16 hex chars
-- ============================================================
local function verifyChecksum(source, token, expected)
  local h   = sha256(token .. source)
  local hex = ""
  for i = 1, 8 do
    hex = hex .. string.format("%02x", h:byte(i))
  end
  return hex == expected
end

-- ============================================================
-- HTTP POST via gg.makeRequest
-- checkAntiHook() ถูกเรียกก่อน gg.makeRequest ทุกครั้ง
-- ============================================================
local function jsonEncode(t)
  local parts = {}
  for k, v in pairs(t) do
    local val
    if type(v) == "string" then
      val = '"' .. v:gsub('\\\\', '\\\\\\\\'):gsub('"', '\\\\"') .. '"'
    elseif v == nil then
      val = "null"
    else
      val = tostring(v)
    end
    parts[#parts+1] = '"' .. k .. '":' .. val
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

local function jsonGetStr(s, key)
  return s:match('"' .. key .. '"%s*:%s*"([^"]*)"')
end
local function jsonGetBool(s, key)
  local v = s:match('"' .. key .. '"%s*:%s*(%a+)')
  return v == "true"
end
local function jsonGetInt(s, key)
  local v = s:match('"' .. key .. '"%s*:%s*(%d+)')
  return tonumber(v)
end

-- parse JSON array of strings: ["aaa","bbb",...]
local function jsonGetStrArray(s, key)
  local arr = s:match('"' .. key .. '"%s*:%s*(%[.-%])')
  if not arr then return nil end
  local items = {}
  for item in arr:gmatch('"([^"]*)"') do
    items[#items+1] = item
  end
  return items
end

local function post(path, body)
  -- Anti-hook: ตรวจก่อนทุก network call
  checkAntiHook()

  local url     = API_ENDPOINT .. path
  local bodyStr = jsonEncode(body)
  local ok, res = pcall(function()
    return gg.makeRequest(url, {["Content-Type"] = "application/json"}, bodyStr)
  end)
  if not ok or not res then return nil, "http_error" end
  local raw
  if type(res) == "table" then
    raw = res.body or res.content or ""
  else
    raw = tostring(res)
  end
  local data = {
    success       = jsonGetBool(raw, "success"),
    session_token = jsonGetStr(raw, "session_token"),
    reason        = jsonGetStr(raw, "reason"),
    checksum      = jsonGetStr(raw, "checksum"),
    count         = jsonGetInt(raw, "count"),
    chunks        = jsonGetStrArray(raw, "chunks"),
  }
  return data, nil
end

-- ============================================================
-- Main Loader (v2)
-- ============================================================
local function run()
  -- Initial anti-hook check
  checkAntiHook()

  gg.toast("[Loader] กำลังตรวจสอบ License...")

  -- 1. ขอ session token
  local sessionData, err = post("/api/runtime/session", {
    protection_id = PROTECTION_ID,
    license       = LICENSE_KEY,
    device_id     = DEVICE_ID,
  })
  if not sessionData or not sessionData.success then
    local reason = (sessionData and sessionData.reason) or err or "unknown"
    gg.alert("[Loader] ไม่ผ่านการตรวจสอบ\\n" .. reason)
    os.exit()
    return
  end
  local sessionToken = sessionData.session_token
  sessionData = nil  -- clear session response

  -- 2. ขอ chunks payload
  local payloadData, perr = post("/api/runtime/payload", {
    protection_id = PROTECTION_ID,
    session_token = sessionToken,
  })
  if not payloadData or not payloadData.success then
    local reason = (payloadData and payloadData.reason) or perr or "unknown"
    gg.alert("[Loader] โหลด Script ไม่สำเร็จ\\n" .. reason)
    os.exit()
    return
  end

  local chunks   = payloadData.chunks
  local checksum = payloadData.checksum
  local count    = payloadData.count

  if not chunks or type(chunks) ~= "table" or #chunks == 0 then
    gg.alert("[Loader] Payload format ผิดพลาด (no chunks)")
    os.exit()
    return
  end
  if not checksum or checksum == "" then
    gg.alert("[Loader] Payload format ผิดพลาด (no checksum)")
    os.exit()
    return
  end
  if count and count ~= #chunks then
    gg.alert("[Loader] Payload format ผิดพลาด (count mismatch)")
    os.exit()
    return
  end

  payloadData = nil  -- clear raw payload response

  -- 3. Chunk streaming decode
  --    XOR แต่ละ chunk ด้วย per-chunk keystream แล้ว concat
  --    ทันทีหลัง concat: nil chunk + GC → plaintext window ≤ 512 bytes
  local sourceParts = {}
  for i = 1, #chunks do
    local encoded = chunks[i]
    local raw_chunk = b64decode(encoded)
    encoded = nil  -- release base64 string

    -- derive keystream for this chunk (index is 0-based ตรงกับ server)
    local ks = deriveChunkKeystream(sessionToken, i - 1, #raw_chunk)

    -- XOR decode chunk
    local plain = {}
    for j = 1, #raw_chunk do
      plain[j] = string.char(raw_chunk:byte(j) ~ ks:byte(j))
    end
    local plain_str = table.concat(plain)

    sourceParts[i] = plain_str

    -- Wipe intermediate variables immediately
    raw_chunk  = nil
    ks         = nil
    plain      = nil
    plain_str  = nil
    collectgarbage()  -- force GC ให้ collect plaintext fragment ทันที
  end

  chunks = nil  -- release encoded chunks array

  -- 4. Assemble full source
  local source = table.concat(sourceParts)
  sourceParts  = nil  -- release parts array
  collectgarbage()

  -- 5. ตรวจ checksum: SHA256(sessionToken || source) → first 8 bytes → 16 hex
  if not verifyChecksum(source, sessionToken, checksum) then
    gg.alert("[Loader] Integrity check ล้มเหลว\\nอาจถูกดัดแปลง")
    source = nil
    collectgarbage()
    os.exit()
    return
  end

  sessionToken = nil  -- token ไม่จำเป็นอีกต่อไป

  -- 6. Compile + execute
  local fn, compileErr = load(source)

  -- Wipe source ทันทีหลัง load() — ไม่เก็บ plaintext ไว้อีก
  source = nil
  collectgarbage()

  if not fn then
    gg.alert("[Loader] Compile error:\\n" .. (compileErr or "unknown"))
    os.exit()
    return
  end

  gg.toast("[Loader] โหลดสำเร็จ")

  -- Execute — fn เป็น local ไม่ expose global
  fn()

  -- Wipe fn reference หลัง execute
  fn = nil
  collectgarbage()
end

run()
`
}
