--[[
  ============================================================
  LOADER — ไฟล์นี้แจกให้ผู้ใช้
  ============================================================
  วิธีใช้:
  1. แทนที่ LICENSE_KEY ด้วย key ที่ออกให้ผู้ใช้
  2. แทนที่ API_URL ด้วย domain Vercel ของคุณ
  3. แจกไฟล์นี้ให้ผู้ใช้แทนไฟล์สคริปต์หลัก
  ============================================================

  Security layers:
  - โค้ดหลักไม่อยู่ในไฟล์นี้เลย → ดูไฟล์นี้ก็ไม่ได้อะไร
  - ต้องผ่าน License check ก่อน ถึงจะได้ payload
  - payload เป็น XOR-encrypted → ดู network traffic ก็อ่านไม่ออก
  - โค้ดรันใน memory เท่านั้น ไม่แตะ disk
  ============================================================
]]

-- ============================================================
-- ⚙️ ตั้งค่า (แก้ตรงนี้อย่างเดียว)
-- ============================================================
local LICENSE_KEY = "XXXX-XXXX-XXXX-XXXX"   -- ← ใส่ key ของผู้ใช้
local API_URL     = "https://your-domain.vercel.app"  -- ← domain Vercel ของคุณ
-- ============================================================

local HttpService = game:GetService("HttpService")

-- Device ID: ผูกกับ PlaceId + JobId (unique ต่อ server instance)
local DEVICE_ID = tostring(game.PlaceId) .. "_" .. tostring(game.JobId):sub(1, 8)

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

-- ─── Step 1: License Check ─────────────────────────────────
local checkOk, checkResult = pcall(function()
  return HttpService:PostAsync(
    API_URL .. "/api/license/check",
    HttpService:JSONEncode({
      license   = LICENSE_KEY,
      device_id = DEVICE_ID,
    }),
    Enum.HttpContentType.ApplicationJson,
    false,
    { ["Content-Type"] = "application/json" }
  )
end)

if not checkOk then
  error("[Loader] ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่")
end

local checkData = HttpService:JSONDecode(checkResult)

if not checkData.allowed then
  local reasons = {
    invalid_license = "License ไม่ถูกต้อง",
    disabled        = "License ถูกปิดใช้งาน",
    banned          = "License ถูกแบน",
    expired         = "License หมดอายุ",
    device_mismatch = "อุปกรณ์ไม่ตรงกับที่ผูกไว้",
    invalid_request = "Request ไม่ถูกต้อง",
  }
  error("[Loader] " .. (reasons[checkData.reason] or "ไม่มีสิทธิ์ใช้งาน"))
end

local token = checkData.token

-- ─── Step 2: Load Encrypted Script ────────────────────────
local loadOk, loadResult = pcall(function()
  return HttpService:PostAsync(
    API_URL .. "/api/license/load",
    HttpService:JSONEncode({
      license   = LICENSE_KEY,
      device_id = DEVICE_ID,
      token     = token,
    }),
    Enum.HttpContentType.ApplicationJson,
    false,
    { ["Content-Type"] = "application/json" }
  )
end)

if not loadOk then
  error("[Loader] โหลด script ไม่สำเร็จ กรุณาลองใหม่")
end

local loadData = HttpService:JSONDecode(loadResult)

if not loadData.success then
  local reasons = {
    no_script      = "ยังไม่มี script สำหรับ License นี้",
    invalid_token  = "Token หมดอายุ กรุณา re-execute",
    token_mismatch = "Token ไม่ตรงกัน",
    device_mismatch = "อุปกรณ์ไม่ตรงกัน",
    rate_limited   = "ถูก rate limit กรุณารอสักครู่",
  }
  error("[Loader] " .. (reasons[loadData.reason] or "โหลด script ไม่สำเร็จ"))
end

-- ─── Step 3: Decrypt + Execute in Memory ──────────────────
local plainCode = xorDecrypt(loadData.payload, loadData.session_key)

-- ล้างตัวแปรทุกตัวก่อน execute (ลด attack surface)
local _payload    = loadData.payload
local _sessionKey = loadData.session_key
loadData = nil
checkData = nil
token = nil
_payload = nil
_sessionKey = nil

-- loadstring รันโค้ดใน memory โดยตรง ไม่มีการ save ลง disk
local fn, err = loadstring(plainCode)
plainCode = nil  -- ล้าง plain text ทันที

if not fn then
  error("[Loader] Script error: " .. tostring(err))
end

-- ✅ รันโค้ดหลัก
fn()
