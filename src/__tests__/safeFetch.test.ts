import { describe, expect, it } from "vitest";
import { assertUrlIsPublic } from "../lib/safe-fetch";

describe("assertUrlIsPublic — SSRF blocklist", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/file",
    "gopher://example.com",
    "data:text/plain;base64,SGVsbG8=",
    "javascript:alert(1)",
  ])("rejects non-http(s) protocol %s", async (url) => {
    await expect(assertUrlIsPublic(url)).rejects.toThrow(/protocol not allowed/);
  });

  it.each([
    "http://127.0.0.1/",
    "http://127.0.0.1:3000/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://10.255.255.255/",
    "http://172.16.0.5/",
    "http://172.31.255.254/",
    "http://192.168.1.1/",
    "http://169.254.169.254/computeMetadata/v1/", // Cloud metadata
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/", // CGNAT
    "http://224.0.0.1/", // multicast
    "http://240.0.0.1/", // reserved
    "http://198.18.0.1/", // benchmarking
    "http://192.0.2.1/", // TEST-NET-1
    "http://198.51.100.1/", // TEST-NET-2
    "http://203.0.113.1/", // TEST-NET-3
  ])("blocks literal private/reserved IPv4 %s", async (url) => {
    await expect(assertUrlIsPublic(url)).rejects.toThrow(/SSRF/);
  });

  it.each([
    "http://[::1]/",
    "http://[::]/",
    "http://[fc00::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://[ff00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:10.0.0.1]/",
  ])("blocks literal private/reserved IPv6 %s", async (url) => {
    await expect(assertUrlIsPublic(url)).rejects.toThrow(/SSRF/);
  });

  it("rejects malformed URLs", async () => {
    await expect(assertUrlIsPublic("not a url")).rejects.toThrow(/invalid URL/);
    await expect(assertUrlIsPublic("https://")).rejects.toThrow(/invalid URL/);
  });

  it("rejects malformed IPv4 literals", async () => {
    await expect(assertUrlIsPublic("http://999.999.999.999/")).rejects.toThrow();
  });

  it("rejects URLs that resolve to localhost", async () => {
    // `localhost` typically resolves to 127.0.0.1 / ::1
    await expect(assertUrlIsPublic("http://localhost:3000/admin")).rejects.toThrow(/SSRF/);
  });

  // Note: We intentionally do NOT test that public domains pass, because
  // tests should not depend on real DNS / network. Coverage of the
  // allow-path comes from integration with /api/ingest and live HTTP probes.
});
