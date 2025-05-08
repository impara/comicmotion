import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// Define an interface for your custom public metadata to ensure type safety
interface CustomPublicMetadata {
  role?: 'free' | 'premium' | 'admin';
  isSubscribed?: boolean;
  // Add other custom fields here if they exist
}

export async function GET() {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    // This means the user is not authenticated.
    return NextResponse.json({ error: 'Unauthorized: No authenticated user' }, { status: 401 });
  }

  const publicMetadata = sessionClaims?.publicMetadata as CustomPublicMetadata | undefined;
  const userRole = publicMetadata?.role;

  if (userRole === 'admin') {
    return NextResponse.json({ message: 'Welcome, Admin! This is an admin-only endpoint.' });
  } else {
    return NextResponse.json({ error: 'Forbidden: You do not have admin privileges.' }, { status: 403 });
  }
} 