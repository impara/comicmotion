"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SuccessPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/"); // Redirect to homepage after 3 seconds
    }, 3000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-4">Payment Successful!</h1>
      <p className="text-lg">Thank you for subscribing to ComicMotion Creator. You now have access to all premium features.</p>
      <p className="mt-4 text-gray-500">Redirecting you to the homepage...</p>
    </div>
  );
}

// STRATEGY SUGGESTION:
// After a successful subscription, you should hide or disable the Subscribe button for users who have an active subscription.
// The best practice is to check the user's subscription status (via Clerk user metadata, your database, or a Stripe webhook)
// and conditionally render the Subscribe button only for users who are not subscribed. 