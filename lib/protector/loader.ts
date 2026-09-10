/**
 * Loader Generator — Server Only
 *
 * สร้าง Loader.lua สำหรับ GameGuardian บน Android
 * Loader มีเฉพาะ: protection_id, api_endpoint
 * ไม่มี Key, Secret, หรือ Source ใดๆ
 *
 * Loader Flow:
 *   1. DEVICE_ID ดึงจาก gg.getTargetInfo() อัตโนมัติ (packageName-versionCode)
 *   2. POST /api/runtime/session → ได้ session_token
 *   3. POST /api/runtime/payload + session_token → ได้ XOR-encrypted source
 *   4. XOR decode ด้วย session_token → plain source bytes
 *   5. load(source)()
 *
 * Security notes:
 *   - session_token อายุ 5 นาที, single-use (revoked หลัง fetch payload)
 *   - Loader ไม่รู้ encryption key ของ payload ที่เก็บใน server
 *   - static analysis ของ Loader ไม่เจอ source
 *   - ดัก HTTP → ได้ XOR data ที่ไม่มี key (key คือ session_token ที่ expire แล้ว)
 *
 * GameGuardian specifics:
 *   - HTTP  : gg.makeRequest() แทน HttpService
 *   - Bitwise: Lua 5.3 native (~, &, |, >>, <<) แทน bit32
 *   - Execute: load() แทน loadstring()
 *   - DEVICE_ID: gg.getTargetInfo().packageName .. "-" .. versionCode
 */

export interface LoaderConfig {
  protectionId: string
  originalFilename: string
  apiEndpoint: string   // e.g. "https://your-app.vercel.app"
  licenseKey: string    // ฝังใน Loader โดยตรง — user ไม่ต้องกรอก
  createdAt: string
}

export function generateLoader(config: LoaderConfig): string {
  const { protectionId, originalFilename, apiEndpoint, licenseKey, createdAt } = config

  return `-- ============================================================
-- Loader: ${originalFilename}
-- Protection: ${protectionId}
-- Generated: ${createdAt}
-- Platform: GameGuardian (Android / Lua 5.3)
-- ============================================================
-- คำเตือน: ไฟล์นี้สร้างโดยอัตโนมัติ ไม่ควรแก้ไข
-- ============================================================

local PROTECTION_ID = "${protectionId}"
local API_ENDPOINT  = "${apiEndpoint}"

local LICENSE_KEY = "${licenseKey}"

-- DEVICE_ID ดึงจาก GameGuardian อัตโนมัติ
-- ใช้ packageName + versionCode เพื่อ binding กับเกมเวอร์ชันนี้
local DEVICE_ID = (function()
  local ok, info = pcall(function() return gg.getTargetInfo() end)
  if ok and info and info.packageName then
    return info.packageName .. "-" .. tostring(info.versionCode or "0")
  end
  return "unknown-device"
end)()

-- ============================================================
-- SHA-256 (pure Lua 5.3 — native bitwise operators)
-- ไม่ใช้ bit32 เพราะ GameGuardian ใช้ Lua 5.3+
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
    msg = msg .. string.char(0,0,0,0,
      (bits >> 24) & 0xff,
      (bits >> 16) & 0xff,
      (bits >>  8) & 0xff,
       bits        & 0xff)
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
-- XOR keystream (ตรงกับ engine.ts deriveKeystream)
-- ============================================================
local function deriveKeystream(seed, length)
  local blocks, total, counter = {}, 0, 0
  while total < length do
    local block = sha256(seed .. string.char(counter & 0xff, (counter >> 8) & 0xff))
    blocks[#blocks+1] = block
    total   = total + #block
    counter = counter + 1
  end
  return table.concat(blocks):sub(1, length)
end

-- ============================================================
-- XOR decode
-- ============================================================
local function xorDecode(data, key)
  local ks  = deriveKeystream(key, #data)
  local out = {}
  for i = 1, #data do
    out[i] = string.char(data:byte(i) ~ ks:byte(i))
  end
  return table.concat(out)
end

-- ============================================================
-- Checksum verify (ตรงกับ engine.ts: sha256(token..source) → first 8 bytes hex)
-- ============================================================
local function verifyChecksum(source, token, expected)
  local h   = sha256(token .. source)
  local hex = ""
  for i = 1, 8 do hex = hex .. string.format("%02x", h:byte(i)) end
  return hex == expected
end

-- ============================================================
-- HTTP POST via gg.makeRequest
-- ============================================================
local function jsonEncode(t)
  local parts = {}
  for k, v in pairs(t) do
    local val
    if type(v) == "string" then
      -- escape backslash และ double-quote
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

-- JSON decode แบบ minimal สำหรับ response ที่รู้โครงสร้าง
local function jsonGetStr(s, key)
  local v = s:match('"' .. key .. '"%s*:%s*"([^"]*)"')
  return v
end
local function jsonGetBool(s, key)
  local v = s:match('"' .. key .. '"%s*:%s*(%a+)')
  return v == "true"
end

local function post(path, body)
  local url    = API_ENDPOINT .. path
  local bodyStr = jsonEncode(body)
  local ok, res = pcall(function()
    return gg.makeRequest(url, {["Content-Type"] = "application/json"}, bodyStr)
  end)
  if not ok or not res then return nil, "http_error" end
  -- gg.makeRequest คืน table {code, body} หรือ string
  local raw
  if type(res) == "table" then
    raw = res.body or res.content or ""
  else
    raw = tostring(res)
  end
  -- parse fields ที่ต้องการ
  local data = {
    success       = jsonGetBool(raw, "success"),
    session_token = jsonGetStr(raw,  "session_token"),
    reason        = jsonGetStr(raw,  "reason"),
    data          = jsonGetStr(raw,  "data"),
    checksum      = jsonGetStr(raw,  "checksum"),
  }
  return data, nil
end

-- ============================================================
-- Main Loader
-- ============================================================
local function run()
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

  -- 2. ขอ payload
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

  -- 3. Decode XOR
  local rawB64   = payloadData.data
  local checksum = payloadData.checksum
  if not rawB64 or rawB64 == "" or not checksum or checksum == "" then
    gg.alert("[Loader] Payload format ผิดพลาด")
    os.exit()
    return
  end

  local encrypted = b64decode(rawB64)
  local source    = xorDecode(encrypted, sessionToken)

  -- 4. ตรวจ checksum
  if not verifyChecksum(source, sessionToken, checksum) then
    gg.alert("[Loader] Integrity check ล้มเหลว\\nอาจถูกดัดแปลง")
    os.exit()
    return
  end

  -- 5. Execute (GG ใช้ load() ไม่ใช่ loadstring())
  local fn, compileErr = load(source)
  if not fn then
    gg.alert("[Loader] Compile error:\\n" .. (compileErr or "unknown"))
    os.exit()
    return
  end

  gg.toast("[Loader] โหลดสำเร็จ")
  fn()
end

run()
`
}
