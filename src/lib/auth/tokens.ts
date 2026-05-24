import { SignJWT, jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const secretStr = process.env.JWT_SECRET;
  if (!secretStr) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secretStr);
}

const JWT_ISSUER = "mediq";
const JWT_AUDIENCE = "mediq";

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
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<{
  userId: string;
  sessionId: string;
}> {
  const secret = getJwtSecret();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (!payload.uid || !payload.jti) {
    throw new Error("Invalid JWT payload claims");
  }
  return {
    userId: payload.uid as string,
    sessionId: payload.jti as string,
  };
}
