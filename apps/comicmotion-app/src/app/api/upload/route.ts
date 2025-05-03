import { NextResponse } from 'next/server';
import { getPresignedUploadUrl } from 'storage'; // Assuming 'storage' maps to packages/storage
// import { auth } from '@clerk/nextjs/server'; // Import Clerk auth if needed later
import { randomUUID } from 'crypto';

// Define constants for validation
const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE_MB = 8;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export async function POST(request: Request) {
  // TODO: Add proper authentication check
  // const { userId } = auth();
  // if (!userId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  const userId = 'temp-user-id'; // Placeholder until auth is integrated

  try {
    const body = await request.json();
    // Note: We don't get the actual file size here yet, only the filename and contentType
    // Size validation would typically happen client-side first, 
    // and potentially server-side after upload or via presigned URL policies if supported.
    // For now, we focus on validating the provided contentType before generating the URL.
    const { filename, contentType } = body;

    if (!filename || !contentType) {
      return NextResponse.json({ error: 'Missing filename or contentType' }, { status: 400 });
    }

    // --- Server-side Validation --- 
    // 1. Content Type Validation
    if (!ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase())) {
        return NextResponse.json({
             error: `Invalid file type. Only ${ALLOWED_CONTENT_TYPES.join(', ')} allowed.` 
        }, { status: 400 });
    }

    // 2. File Size Validation (Conceptual - requires client to send size or post-upload check)
    // Since we don't have the file size here, this check is more illustrative.
    // A robust implementation might involve:
    //    a) Client sending expected size, backend checks against MAX_FILE_SIZE_BYTES.
    //    b) Using S3 policy conditions in the presigned URL (if supported by MinIO & SDK).
    //    c) Validating the actual object size after upload via a webhook or subsequent check.
    // For now, we rely on the client-side dropzone validation for size.
    // console.log(`Received request for ${filename}, type: ${contentType}`); // Debug log

    // --- End Validation ---

    // Generate a unique key for the object in MinIO/S3
    const uniqueKey = `user-uploads/${userId}/${randomUUID()}-${filename}`;

    // Generate the presigned URL (consider adding size limit condition if possible)
    const uploadUrl = await getPresignedUploadUrl(
        uniqueKey, 
        contentType
        // TODO: Explore adding ContentLengthRange condition to getSignedUrl if feasible for MinIO
    );

    return NextResponse.json({ uploadUrl, key: uniqueKey });

  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: `Failed to get upload URL: ${errorMessage}` }, { status: 500 });
  }
} 