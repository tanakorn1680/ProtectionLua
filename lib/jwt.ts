import { SignJWT, jwtVerify } from 'jose'

function getSecret() {
  const secret = process.env.LICENSE_JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('LICENSE_JWT_SECRET must be at least 32 characters')
  }
  return new TextEncoder().encode(secret)
}

export interface LicenseTokenPayload {
  license_id: string
  license_key: string
  device_id: string | null
  type: 'license_token'
}

export async function signLicenseToken(
  payload: LicenseTokenPayload,
  expireMinutes: number
): Promise<string> {
  const secret = getSecret()
  const expiresIn = `${expireMinutes}m`

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

export async function verifyLicenseToken(
  token: string
): Promise<LicenseTokenPayload | null> {
  try {
    const secret = getSecret()
    const { payload } = await jwtVerify(token, secret)

    if (payload.type !== 'license_token') return null

    return payload as unknown as LicenseTokenPayload
  } catch {
    return null
  }
}
