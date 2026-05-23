import { SignJWT, jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const secretStr = process.env.JWT_SECRET;
  if (!secretStr) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secretStr);
}

export async function signSessionToken(payload: {
  userId: string;
  sessionId: string;
}): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT({ uid: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(payload.sessionId)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<{
  userId: string;
  sessionId: string;
}> {
  const secret = getJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });
  if (!payload.uid || !payload.jti) {
    throw new Error("Invalid JWT payload claims");
  }
  return {
    userId: payload.uid as string,
    sessionId: payload.jti as string,
  };
}
