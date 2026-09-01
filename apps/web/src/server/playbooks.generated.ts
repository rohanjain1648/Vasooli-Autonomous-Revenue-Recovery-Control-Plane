// GENERATED FILE — do not edit.
// Source: /playbooks/*.yaml (5 files)
// Regenerate: pnpm --filter @vasooli/web run generate:playbooks

import type { RawPlaybook } from "@vasooli/engine";

export const PLAYBOOKS: RawPlaybook[] = [
  {
    "id": "checkout-recovery-v1",
    "name": "Checkout Abandonment Recovery",
    "category": "checkout_abandonment",
    "cost_paise": 0,
    "arms": [
      {
        "name": "control",
        "description": "No nudge sent (holdout baseline within this playbook)",
        "requires_approval": false
      },
      {
        "name": "cart-reminder",
        "description": "Friendly reminder that the cart/order is still open",
        "requires_approval": false,
        "template": "Hi {{ customer_name }},\n\nYou started a payment of ₹{{ amount }} but didn't finish checkout.\nPick up where you left off: {{ retry_link }}\n\nBest,\n{{ merchant_name }} Team\n"
      },
      {
        "name": "checkout-offer",
        "description": "Small incentive discount to complete a high-value abandoned checkout",
        "requires_approval": true,
        "template": "Hi {{ customer_name }},\n\nStill interested in completing your ₹{{ amount }} order? Finish now\nand get 3% off: {{ offer_link }}\n\nBest,\n{{ merchant_name }} Team\n"
      }
    ]
  },
  {
    "id": "email-recovery-v1",
    "name": "Email Recovery Outreach",
    "category": "payment_failure",
    "cost_paise": 0,
    "arms": [
      {
        "name": "control",
        "description": "No email sent (holdout baseline within this playbook)",
        "requires_approval": false
      },
      {
        "name": "email-reminder",
        "description": "Friendly payment retry reminder",
        "requires_approval": false,
        "template": "Hi {{ customer_name }},\n\nWe noticed your recent payment of ₹{{ amount }} didn't go through\n({{ error_reason }}). You can retry here: {{ retry_link }}\n\nBest,\n{{ merchant_name }} Team\n"
      },
      {
        "name": "email-offer",
        "description": "2% one-time discount as a courtesy for high-value customers",
        "requires_approval": true,
        "template": "Hi {{ customer_name }},\n\nYour payment of ₹{{ amount }} needs attention. As a one-time courtesy,\nwe're offering 2% off: {{ offer_link }}\n\nBest,\n{{ merchant_name }} Team\n"
      }
    ]
  },
  {
    "id": "offer-discount-v1",
    "name": "Early Settlement Discount",
    "category": "b2b_receivable",
    "cost_paise": 0,
    "arms": [
      {
        "name": "control",
        "description": "No discount offered",
        "requires_approval": false
      },
      {
        "name": "discount-5pct",
        "description": "5% discount if paid within 7 days",
        "requires_approval": true,
        "template": "Dear {{ customer_name }},\n\nInvoice {{ invoice_id }} for ₹{{ amount }} is now {{ days_overdue }}\ndays overdue. Settle within 7 days for a 5% early-settlement discount.\n\nRegards,\n{{ merchant_name }} Accounts Team\n"
      }
    ]
  },
  {
    "id": "phone-ivr-v1",
    "name": "Hinglish IVR Recovery Call",
    "category": "subscription_failure",
    "cost_paise": 200,
    "arms": [
      {
        "name": "control",
        "description": "No call placed",
        "requires_approval": false
      },
      {
        "name": "ivr-reminder",
        "description": "Automated Hinglish reminder call script",
        "requires_approval": false,
        "template": "Namaste {{ customer_name }} ji,\n\nAapka {{ merchant_name }} subscription payment of ₹{{ amount }}\nprocess nahi ho paya kyunki {{ error_reason }}.\n\nKripya apna payment method update karein: {{ retry_link }}\nYa aap humein {{ support_number }} par call kar sakte hain.\n\nDhanyavaad!\n"
      }
    ]
  },
  {
    "id": "waive-fee-v1",
    "name": "Late Fee Waiver",
    "category": "subscription_failure",
    "cost_paise": 0,
    "arms": [
      {
        "name": "control",
        "description": "No waiver offered",
        "requires_approval": false
      },
      {
        "name": "waive-late-fee",
        "description": "Waive the late fee if the failure was issuer-side",
        "requires_approval": true,
        "template": "Hi {{ customer_name }},\n\nWe saw your payment failed due to {{ error_reason }}, which wasn't\nyour fault. We've waived the late fee — please retry: {{ retry_link }}\n\nBest,\n{{ merchant_name }} Team\n"
      }
    ]
  }
];
