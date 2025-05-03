import { NextResponse } from 'next/server';
import { getPresignedUploadUrl } from 'storage'; // Assuming 'storage' maps to packages/storage
// import { auth } from '@clerk/nextjs/server'; // Import Clerk auth if needed later
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  // TODO: Add proper authentication check
  // const { userId } = auth();
  // if (!userId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  const userId = 'temp-user-id'; // Placeholder until auth is integrated

  try {
    const body = await request.json();
    const { filename, contentType } = body;

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
    }

    // Generate a unique key for the object in MinIO/S3
    // Example: user-uploads/{userId}/{uuid}-{filename}
    const uniqueKey = `user-uploads/${userId}/${randomUUID()}-${filename}`;

    const uploadUrl = await getPresignedUploadUrl(uniqueKey, contentType);

    return NextResponse.json({ uploadUrl, key: uniqueKey });

  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    // Check if error is a known type, otherwise return generic message
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: `Failed to get upload URL: ${errorMessage}` }, { status: 500 });
  }
} 