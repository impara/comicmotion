'use client';

import { UserProfile } from '@clerk/nextjs';

export default function AccountPage() {
  return (
    <div className="flex flex-col items-center justify-start min-h-screen py-12">
      <h1 className="text-3xl font-bold mb-8">Manage Your Account</h1>
      <div className="w-full max-w-4xl">
        <UserProfile 
            path="/account" // Tells Clerk the base path for this component
            routing="path" // Ensures Clerk uses path-based routing for its internal navigation
        />
      </div>
    </div>
  );
} 