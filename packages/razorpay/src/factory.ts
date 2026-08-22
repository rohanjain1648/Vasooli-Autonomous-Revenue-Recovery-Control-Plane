import type { RazorpayClient } from "./client.js";
import { FakeRazorpayClient } from "./fake-client.js";
import { LiveRazorpayClient } from "./live-client.js";

/** Same live/fake switch pattern as @vasooli/llm's createLlmProvider:
 * presence of RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET flips to live with no
 * code changes elsewhere (design spec §11). */
export function createRazorpayClient(env: NodeJS.ProcessEnv = process.env): RazorpayClient {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (keyId && keySecret) {
    return new LiveRazorpayClient({ keyId, keySecret });
  }
  return new FakeRazorpayClient();
}
