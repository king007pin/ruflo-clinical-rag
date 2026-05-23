import { hash, verify } from "@node-rs/argon2";

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, {
    algorithm: 2 as any,
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyPassword(hashVal: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashVal, plain);
  } catch {
    return false;
  }
}
