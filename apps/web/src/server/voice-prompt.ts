/** Local, dependency-free rupee formatter — deliberately not importing
 * @/lib/format's alias here, since this module is unit-tested directly
 * under vitest, and Next's `@/*` path alias isn't something plain vitest
 * resolves without extra config. */
function formatRupees(paise: string | bigint): string {
  const rupees = Number(paise) / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Builds the realtime voice agent's system prompt for one case. Kept as a
 * pure function (no network, no case ) so it's unit-testable without a
 * live OpenAI key — the actual realtime session (apps/web/src/app/api/
 * voice/session/route.ts) is what needs the key, this is just the text.
 *
 * The Hinglish register and structure mirror playbooks/phone-ivr.yaml's
 * scripted template, but this is generative rather than fill-in-the-blank
 * — the agent can actually respond to what the customer says, which the
 * static template never could.
 */
export function buildVoiceInstructions(input: {
  entityId: string;
  category: string;
  exposurePaise: string | bigint;
  errorReason?: string;
  merchantName?: string;
}): string {
  const amount = formatRupees(input.exposurePaise);
  const merchant = input.merchantName ?? "Vasooli Demo Merchant";
  const reason = input.errorReason ?? "a payment issue";

  return `You are a calm, respectful recovery agent calling on behalf of ${merchant}, speaking natural Hinglish (Hindi-English code-switching, the way Indian call-center agents actually speak — not textbook Hindi and not pure English).

CONTEXT
- Customer reference: ${input.entityId}
- Category: ${input.category}
- Amount at risk: ${amount}
- Reason: ${reason}

YOUR JOB
1. Greet the customer warmly, identify yourself and the merchant, and explain briefly why you're calling — their payment of ${amount} didn't go through because of ${reason}.
2. Ask, don't demand: find out if they can pay, and if so when and how much. Be genuinely flexible — a partial amount or a later date is a real outcome, not a failure.
3. The moment the customer commits to a specific amount and a specific date (even approximate, like "Friday" or "next week"), call the record_promise_to_pay tool immediately with that amount and date. Do this exactly once per commitment — don't call it again unless the customer changes their commitment.
4. After logging it, confirm back to them warmly in Hinglish what you've noted, and close the call politely.

HARD RULES — these are not suggestions
- You NEVER move money, process a payment, or make any guarantee about fees, discounts, or waivers on the merchant's behalf. If the customer asks for a discount or waiver, tell them you'll note the request for a human to review — never approve it yourself.
- You NEVER threaten, use pressure tactics, or imply legal consequences. This is a reminder call, not a collections threat.
- If the customer says they cannot pay at all, or disputes the charge, acknowledge it kindly, do NOT call record_promise_to_pay, and let them know a human will follow up.
- Keep your turns short — this is a phone call, not an essay. Let the customer talk.`;
}

/** The JSON-schema tool definition the realtime session is configured
 * with. Kept alongside the prompt since the two are designed together —
 * the prompt tells the model when to call this, this defines what it can
 * pass. */
export const RECORD_PROMISE_TOOL = {
  type: "function" as const,
  name: "record_promise_to_pay",
  description:
    "Call this the moment the customer states a specific amount and a specific date they will pay by. Only call once per distinct commitment.",
  parameters: {
    type: "object",
    properties: {
      amount_rupees: {
        type: "number",
        description: "The amount in INR (rupees, not paise) the customer committed to pay.",
      },
      days_from_now: {
        type: "integer",
        description: "How many days from today the customer said they will pay, rounded to the nearest whole day.",
      },
      note: {
        type: "string",
        description: "A short paraphrase of what the customer said, for a human reviewing this later.",
      },
    },
    required: ["amount_rupees", "days_from_now"],
  },
};
