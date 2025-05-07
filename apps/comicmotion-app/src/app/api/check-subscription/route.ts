import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PrismaClient } from "db";

const prisma = new PrismaClient();

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Find the user in our database using the Clerk ID
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { subscription: true }
    });

    if (!user) {
      console.log(`User with Clerk ID ${userId} not found in database during subscription check`);
      return NextResponse.json(
        { isSubscribed: false },
        { status: 200 }
      );
    }

    // Check if user has a valid subscription
    const isSubscribed = Boolean(
      user.subscription && 
      user.subscription.status === "active" && 
      user.subscription.stripeCurrentPeriodEnd && 
      user.subscription.stripeCurrentPeriodEnd > new Date()
    );

    console.log(`Subscription check for user ${userId}: isSubscribed=${isSubscribed}`);
    return NextResponse.json({ isSubscribed });
  } catch (error) {
    console.error("Error checking subscription:", error);
    return NextResponse.json(
      { error: "Failed to check subscription status" },
      { status: 500 }
    );
  }
} 