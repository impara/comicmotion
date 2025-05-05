"use client";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";

export function SubscribeButton() {
  const [loading, setLoading] = useState(false);
  const { user } = useUser();

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

  if (user?.publicMetadata?.isSubscribed) {
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