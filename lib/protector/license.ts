/**
 * license.ts
 * สร้าง License validation header สำหรับ Strong level
 * Lua code ที่ generated จะ call API /api/license/check ก่อนรัน
 *
 * ⚠️ ห้ามฝัง: SUPABASE_SERVICE_ROLE_KEY, JWT Secret, หรือ server secrets
 */

export interface LicenseInjectionOptions {
  /** API base URL (ไม่มี trailing slash) */
  apiBase: string
  /** License ID ที่ผูก (ถ้า mode = require_specific) */
  licenseId?: string
}

/**
 * สร้าง Lua header สำหรับ License validation
 * ใช้ /api/license/check endpoint เดิม
 * ไม่มี Secret ใดๆ ใน output
 */
export function buildLicenseHeader(opts: LicenseInjectionOptions): string {
  const apiUrl = `${opts.apiBase}/api/license/check`
  const licenseIdComment = opts.licenseId
    ? `-- Bound license: ${opts.licenseId.slice(0, 8)}...`
    : '-- Any valid license accepted'

  return `
--[[
  License Validation Layer
  ${licenseIdComment}
  ⚠️ การแก้ไขหรือ bypass ส่วนนี้ถือเป็นการละเมิดข้อตกลงการใช้งาน
]]

local _LM = {}
_LM.api = "${apiUrl}"

-- ฟังก์ชันตรวจสอบ License (ต้องการ http library)
function _LM.check(license_key, device_id)
  if type(license_key) ~= "string" or #license_key < 1 then
    return false, "invalid_license_key"
  end

  -- ใช้ HTTP request ไปยัง License API
  -- environment ต้องมี http.request หรือ equivalent
  local ok, result = pcall(function()
    local body = '{"license":"' .. license_key .. '","device_id":"' .. (device_id or "") .. '"}'
    -- หมายเหตุ: implementation นี้ต้องปรับตาม HTTP library ที่ใช้งาน
    -- รองรับ: luasocket, copas, หรือ custom http binding
    if http and http.request then
      local res, code = http.request({
        url = _LM.api,
        method = "POST",
        headers = {
          ["Content-Type"] = "application/json",
          ["Content-Length"] = tostring(#body),
        },
        source = ltn12 and ltn12.source.string(body) or nil,
      })
      if code == 200 then
        return res
      end
    elseif _ENV and _ENV.fetch then
      -- Web environment (Luau/Roblox style)
      local res = _ENV.fetch(_LM.api, {
        method = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body = body,
      })
      return res
    end
    return nil
  end)

  if not ok or not result then
    return false, "network_error"
  end

  -- parse response
  local allowed = tostring(result):find('"allowed":true') ~= nil
  if not allowed then
    local reason = tostring(result):match('"reason":"([^"]+)"') or "denied"
    return false, reason
  end

  return true, "ok"
end

-- ตรวจสอบ License ก่อนเริ่มทำงาน
local _license_key = _LICENSE_KEY or (os and os.getenv and os.getenv("LICENSE_KEY")) or ""
local _device_id = _DEVICE_ID or (os and os.getenv and os.getenv("DEVICE_ID")) or ""

if _license_key == "" then
  error("[License Required] กรุณาตั้งค่า _LICENSE_KEY ก่อนใช้งาน script นี้", 0)
end

local _valid, _reason = _LM.check(_license_key, _device_id)
if not _valid then
  error("[License Invalid] " .. tostring(_reason) .. " - กรุณาตรวจสอบ License ของคุณ", 0)
end

-- ล้างตัวแปร sensitive
_license_key = nil
_device_id = nil
_LM = nil

-- [Protected Content Below]
`.trim()
}

/**
 * สร้าง simple Lua wrapper ที่ไม่ validate (สำหรับ basic/standard)
 */
export function buildNoLicenseHeader(): string {
  return `-- Protected by License Manager\n-- ⚠️ การแก้ไขไฟล์นี้อาจทำให้ไม่สามารถทำงานได้\n`
}
