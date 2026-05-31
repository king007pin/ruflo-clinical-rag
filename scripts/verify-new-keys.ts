import dotenv from "dotenv";
import path from "node:path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function verifyKey(key: string, idx: number): Promise<{ success: boolean; error?: string }> {
  const cleanKey = key.trim();
  if (!cleanKey) return { success: false, error: "Empty Key" };

  try {
    const res = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        input: ["Verification probe test"],
        model: "nvidia/nv-embedqa-e5-v5",
        encoding_format: "float",
        input_type: "query",
      }),
    });

    if (res.ok) {
      return { success: true };
    } else {
      const text = await res.text().catch(() => "");
      return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 150)}` };
    }
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

async function main() {
  const keysStr = process.env.NVIDIA_API_KEY || "";
  if (!keysStr) {
    console.error("❌ No keys found in NVIDIA_API_KEY environment variable!");
    process.exit(1);
  }

  const keys = keysStr.split(",").map((k) => k.trim()).filter(Boolean);
  console.log(`🔍 Found ${keys.length} keys in pool. Initiating parallel validation...`);

  const results = await Promise.all(
    keys.map((key, idx) => verifyKey(key, idx).then((res) => ({ idx: idx + 1, res })))
  );

  let successCount = 0;
  results.forEach(({ idx, res }) => {
    if (res.success) {
      console.log(`✅ Key ${idx} is ACTIVE and VALID.`);
      successCount++;
    } else {
      console.error(`❌ Key ${idx} is INVALID or degraded! Reason: ${res.error}`);
    }
  });

  console.log(`\n📊 Diagnostic Summary: ${successCount}/${keys.length} keys are working perfectly!`);
  if (successCount === keys.length) {
    console.log("🟢 All NVIDIA NIM API keys are ready for production routing!");
  } else {
    console.warn("⚠️ Some keys are degraded. Verify your key list in .env.local.");
  }
}

main().catch((err) => {
  console.error("Fatal diagnostic error:", err);
  process.exit(1);
});
