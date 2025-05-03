import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define routes that should be publicly accessible
const isPublicRoute = createRouteMatcher([
    '/', // Homepage
    '/sign-in(.*)', // Clerk sign-in routes
    '/sign-up(.*)', // Clerk sign-up routes
    '/api/stripe-webhook(.*)', // Stripe webhook
    '/api/checkout(.*)', // Stripe checkout initiation
    '/api/trpc(.*)', // Allow tRPC endpoint access (adjust if needed)
    // Add other public API routes or pages here if necessary
]);

// Define routes that should always be ignored by the middleware (e.g., static assets)
// NOTE: The matcher in `config` below handles most static files automatically.
// This matcher is mostly for specific files if needed, but often not required.
// const isIgnoredRoute = createRouteMatcher([
//     '/favicon.ico',
//     '/vercel.svg',
//     '/next.svg',
//     '/file.svg',
//     '/window.svg',
//     '/globe.svg'
// ]);

// Use async callback as shown in some documentation examples
export default clerkMiddleware((auth, req) => {
  // clerkMiddleware automatically protects routes that are not public
  if (!isPublicRoute(req)) {
    // The auth() object here is for checking authentication state if needed,
    // but protection is handled by clerkMiddleware itself based on public routes.
    // No explicit protect() call is needed here.
    auth(); // You can call auth() to check state if needed, e.g., auth().userId
  }
});

export const config = {
  // The following matcher runs middleware on all routes
  // except static assets and other Next.js internals.
  matcher: [
    '/((?!.*\\..*|_next).*)', // Exclude files with extensions and _next folder
    '/', // Include root
    '/(api|trpc)(.*)' // Include API routes
  ],
}; 