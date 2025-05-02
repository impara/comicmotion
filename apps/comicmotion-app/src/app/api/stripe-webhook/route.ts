import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { users } from "@clerk/clerk-sdk-node";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return NextResponse.json({ error: `Webhook Error: ${(err as Error).message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Assume client_reference_id is Clerk user ID (set this when creating the session)
    const clerkUserId = session.client_reference_id;
    if (clerkUserId) {
      try {
        await users.updateUser(clerkUserId, {
          publicMetadata: { isSubscribed: true },
        });
      } catch (e) {
        return NextResponse.json({ error: `Failed to update user: ${(e as Error).message}` }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
} 