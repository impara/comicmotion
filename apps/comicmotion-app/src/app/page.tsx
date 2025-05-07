'use client';

// import Image from "next/image"; // Removed unused import
import { HealthStatus } from './HealthStatus';
import { UserButton, SignInButton, SignUpButton, SignedIn, SignedOut, useAuth } from '@clerk/nextjs';
import { SubscribeButton } from './SubscribeButton';

// Define an interface for your custom public metadata
interface CustomPublicMetadata {
  role?: 'free' | 'premium' | 'admin';
  isSubscribed?: boolean;
  // Add other custom fields here if they exist
}

// New component to handle role-specific content
function UserSpecificContent() {
  const { sessionClaims, isSignedIn } = useAuth();

  console.log("UserSpecificContent: isSignedIn:", isSignedIn);
  console.log("UserSpecificContent: sessionClaims:", sessionClaims); // Expand this in console!

  // --- Try accessing the metadata directly from sessionClaims --- 
  // Clerk might place claims defined in the JWT template directly onto sessionClaims,
  // *not* necessarily nested under a specific "publicMetadata" key within sessionClaims itself.
  const publicMetadata = sessionClaims?.public_metadata as CustomPublicMetadata | undefined;
  // If you used a different key in the JWT template (e.g., "app_metadata"), use that here:
  // const publicMetadata = sessionClaims?.app_metadata as CustomPublicMetadata | undefined; 

  console.log("UserSpecificContent: publicMetadata (accessed directly):", publicMetadata);

  const userRole = publicMetadata?.role;
  console.log("UserSpecificContent: userRole:", userRole);

  if (!isSignedIn) {
    // Optional: Render nothing or a loading state if not signed in yet, though <SignedIn> should handle this.
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4">
        <span className="text-blue-700">You are signed in!</span>
        <UserButton afterSignOutUrl="/" />
      </div>
      {userRole === 'premium' && (
        <button className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">
          Access Premium Feature
        </button>
      )}
      {userRole === 'admin' && (
        <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
          Admin Panel Access (Placeholder)
        </button>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <div className="grid grid-rows-[auto_1fr_auto] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <header className="row-start-1 w-full flex justify-center">
         <HealthStatus />
      </header>
      
      <main className="row-start-2 flex flex-col items-center justify-center gap-8 w-full">
        <div className="mb-4">
          <SignedIn>
            <UserSpecificContent />
          </SignedIn>
          <SignedOut>
            <div className="flex flex-col items-center gap-4">
              <p className="text-xl mb-4">Welcome to ComicMotion! Sign in or sign up to get started.</p>
              <div className="flex items-center gap-4">
                <SignInButton mode="modal">
                  <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Sign In</button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Sign Up</button>
                </SignUpButton>
              </div>
            </div>
          </SignedOut>
        </div>
        
        <div className="mt-8">
            <SubscribeButton /> 
        </div>
        
        {/* Placeholder for future content for signed-in users, e.g., start generation button */}
        <SignedIn>
            <div className="mt-12 flex flex-col items-center gap-4">
                <h2 className="text-2xl font-semibold">Ready to create?</h2>
                {/* Example button, functionality to be added later */}
                <button 
                    onClick={() => alert('Navigate to upload/creation page - TBD!')}
                    className="px-6 py-3 bg-purple-600 text-white rounded-lg text-lg font-medium hover:bg-purple-700 transition-colors"
                >
                    Start New Comic Generation
                </button>
            </div>
        </SignedIn>

      </main>

      <footer className="row-start-3 w-full flex justify-center items-center p-4 text-sm text-gray-500">
        <p>&copy; {new Date().getFullYear()} ComicMotion. All rights reserved.</p>
      </footer>
    </div>
  );
}
