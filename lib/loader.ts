/**
 * lib/loader.ts
 * สร้าง Loader .lua ที่ฝัง LICENSE_KEY และ API_URL ไว้แล้ว
 * ไม่มี logic ใดๆ ของ script จริงในไฟล์นี้
 */

export function generateLoader(licenseKey: string, apiBase: string): string {
  // trim trailing slash
  const base = apiBase.replace(/\/$/, '')

  return `--[[
  ============================================================
  LOADER — แจกให้ผู้ใช้ไฟล์นี้เท่านั้น
  ============================================================
  License : ${licenseKey}
  ============================================================
  ⚠️ ห้ามแชร์ไฟล์นี้ต่อ — License ผูกกับผู้ใช้คนเดียว
  ============================================================
]]

local LICENSE_KEY = "${licenseKey}"
local API_URL     = "${base}"

-- ─── XOR Decrypt ───────────────────────────────────────────
local function b64decode(s)
  local b = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  s = s:gsub("[^"..b.."=]", "")
  return (s:gsub(".", function(x)
    if x == "=" then return "" end
    local r, f = "", (b:find(x) - 1)
    for i = 6, 1, -1 do r = r .. (f % 2^i - f % 2^(i-1) > 0 and "1" or "0") end
    return r
  end):gsub("%d%d%d%d%d%d%d%d", function(x)
    local n = tonumber(x, 2)
    return n > 0 and string.char(n) or ""
  end))
end

local function xorDecrypt(payload, key)
  local decoded = b64decode(payload)
  local result  = {}
  for i = 1, #decoded do
    local kb = key:byte(((i - 1) % #key) + 1)
    result[i] = string.char(bit32.bxor(decoded:byte(i), kb))
  end
  return table.concat(result)
end
-- ───────────────────────────────────────────────────────────

local DEVICE_ID = gg.getTargetPackage() .. "_" .. tostring(os.time()):sub(-6)

-- ─── Step 1: License Check ─────────────────────────────────
local checkRes = gg.makeRequest(API_URL .. "/api/license/check", {
  method  = "POST",
  headers = { ["Content-Type"] = "application/json" },
  body    = '{"license":"' .. LICENSE_KEY .. '","device_id":"' .. DEVICE_ID .. '"}',
})

if not checkRes or checkRes.code ~= 200 then
  gg.alert("❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้\\nกรุณาตรวจสอบอินเทอร์เน็ต")
  os.exit()
end

local checkData
do
  local ok, parsed = pcall(function()
    -- simple JSON parse สำหรับ fields ที่ต้องการ
    local allowed = checkRes.content:match('"allowed":(true)')
    local token   = checkRes.content:match('"token":"([^"]+)"')
    local reason  = checkRes.content:match('"reason":"([^"]+)"')
    return { allowed = allowed ~= nil, token = token, reason = reason }
  end)
  if not ok then
    gg.alert("❌ ข้อมูลจากเซิร์ฟเวอร์ผิดพลาด")
    os.exit()
  end
  checkData = parsed
end

if not checkData.allowed then
  local msgs = {
    invalid_license = "License ไม่ถูกต้อง",
    disabled        = "License ถูกปิดใช้งาน",
    banned          = "License ถูกแบน",
    expired         = "License หมดอายุ",
    device_mismatch = "อุปกรณ์ไม่ตรงกับที่ผูกไว้",
    rate_limited    = "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่",
  }
  gg.alert("❌ " .. (msgs[checkData.reason] or "ไม่มีสิทธิ์ใช้งาน"))
  os.exit()
end

local token = checkData.token

-- ─── Step 2: Load Encrypted Script ────────────────────────
local loadRes = gg.makeRequest(API_URL .. "/api/license/load", {
  method  = "POST",
  headers = { ["Content-Type"] = "application/json" },
  body    = '{"license":"' .. LICENSE_KEY .. '","device_id":"' .. DEVICE_ID .. '","token":"' .. token .. '"}',
})

if not loadRes or loadRes.code ~= 200 then
  gg.alert("❌ โหลด Script ไม่สำเร็จ\\nกรุณาลองใหม่")
  os.exit()
end

local payload, sessionKey
do
  payload    = loadRes.content:match('"payload":"([^"]+)"')
  sessionKey = loadRes.content:match('"session_key":"([^"]+)"')
  local success = loadRes.content:match('"success":(true)')
  if not success or not payload or not sessionKey then
    gg.alert("❌ ข้อมูล Script ไม่สมบูรณ์")
    os.exit()
  end
end

-- ─── Step 3: Decrypt + Execute in Memory ──────────────────
local plainCode = xorDecrypt(payload, sessionKey)
payload    = nil
sessionKey = nil
token      = nil

local fn, err = load(plainCode)
plainCode = nil

if not fn then
  gg.alert("❌ Script error: " .. tostring(err))
  os.exit()
end

fn()
`
}
