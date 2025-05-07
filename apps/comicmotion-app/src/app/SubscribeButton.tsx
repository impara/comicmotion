"use client";
import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

export function SubscribeButton() {
  const [loading, setLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { user } = useUser();

  // Check subscription status from both Clerk metadata and database
  useEffect(() => {
    if (user) {
      // First check Clerk metadata
      if (user.publicMetadata?.isSubscribed) {
        setIsSubscribed(true);
        return;
      }

      // Then verify with database check
      const checkSubscription = async () => {
        try {
          const res = await fetch('/api/check-subscription');
          const data = await res.json();
          if (data.isSubscribed) {
            setIsSubscribed(true);
          }
        } catch (error) {
          console.error("Failed to check subscription status:", error);
        }
      };

      checkSubscription();
    }
  }, [user]);

  const handleSubscribe = async () => {
    setLoading(true);
    const res = await fetch("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ priceId: "price_1RKQcoI1h2u9PJ8qANPybT83", clientReferenceId: user?.id }), // Pass Clerk user ID
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    setLoading(false);
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || "Something went wrong");
    }
  };

  if (isSubscribed) {
    return <div className="text-green-700">You are already subscribed!</div>;
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      className="px-4 py-2 bg-purple-600 text-white rounded"
    >
      {loading ? "Redirecting..." : "Subscribe"}
    </button>
  );
} 