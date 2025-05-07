import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { users } from "@clerk/clerk-sdk-node";
import { PrismaClient } from "db";

const prisma = new PrismaClient();
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
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: `Webhook Error: ${(err as Error).message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const clerkUserId = session.client_reference_id;

    if (!clerkUserId) {
      console.error("No client_reference_id (Clerk User ID) found in checkout session.");
      return NextResponse.json({ error: "Missing client_reference_id" }, { status: 400 });
    }

    try {
      let clerkUser;
      try {
        clerkUser = await users.getUser(clerkUserId);
        const existingPublicMetadata = clerkUser.publicMetadata || {};
        await users.updateUser(clerkUserId, {
          publicMetadata: {
            ...existingPublicMetadata,
            isSubscribed: true,
            role: "premium",
          },
        });
        console.log(`Successfully updated Clerk user ${clerkUserId} publicMetadata: isSubscribed=true, role=premium`);
      } catch (getUserError) {
        console.warn(`Could not retrieve or update Clerk user ${clerkUserId} metadata:`, getUserError);
        // Continue processing, as DB update is critical
      }
      
      const subscriptionId = session.subscription as string;
      if (!subscriptionId) {
        console.error("No subscription ID found in checkout session.");
        return NextResponse.json({ error: "Missing subscription ID in session" }, { status: 400 });
      }

      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });

      if (!user) {
        console.error(`User with Clerk ID ${clerkUserId} not found in database. Subscription not created for Stripe sub ID: ${stripeSubscription.id}.`);
        return NextResponse.json({ received: true, error: "User not found in DB for subscription update" }); 
      }
      
      // @ts-expect-error: Stripe's response has current_period_end, ensure it's a number
      const currentPeriodEndTimestamp = stripeSubscription.current_period_end;
      let periodEnd: Date;

      if (typeof currentPeriodEndTimestamp === 'number' && !isNaN(currentPeriodEndTimestamp)) {
        periodEnd = new Date(currentPeriodEndTimestamp * 1000);
      } else {
        console.warn(`Invalid or missing current_period_end (${currentPeriodEndTimestamp}) for Stripe subscription ${stripeSubscription.id}. Setting to distant future as fallback.`);
        // Fallback: Set to a distant future date or handle as an error if this is unexpected
        periodEnd = new Date('2099-12-31T23:59:59Z'); // Or handle error appropriately
      }
          
      await prisma.subscription.upsert({
        where: { userId: user.id }, // Ensure this 'user.id' is your internal database ID
        update: {
          stripeCustomerId: stripeSubscription.customer as string,
          stripeSubscriptionId: stripeSubscription.id,
          stripePriceId: stripeSubscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: periodEnd,
          status: stripeSubscription.status,
        },
        create: {
          userId: user.id, // Ensure this 'user.id' is your internal database ID
          stripeCustomerId: stripeSubscription.customer as string,
          stripeSubscriptionId: stripeSubscription.id,
          stripePriceId: stripeSubscription.items.data[0].price.id,
          stripeCurrentPeriodEnd: periodEnd,
          status: stripeSubscription.status,
        },
      });
      console.log(`Successfully created/updated subscription record in DB for user ${user.id} (Clerk ID: ${clerkUserId}), Stripe Sub ID: ${stripeSubscription.id}`);
      
    } catch (e) {
      console.error(`Error processing checkout.session.completed for Clerk ID ${clerkUserId}:`, e);
      return NextResponse.json({ error: `Webhook processing error: ${(e as Error).message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
} 