import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Ensure these environment variables are set in the consuming application (e.g., apps/comicmotion-app/.env.local)
const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_REGION = process.env.S3_REGION || 'us-east-1'; // Default region if not specified
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;

if (!S3_ENDPOINT_URL || !S3_ACCESS_KEY || !S3_SECRET_KEY || !S3_BUCKET_NAME) {
  // In a real app, you might throw an error or have better handling
  console.error("Missing S3/MinIO environment variables!");
  // Potentially throw new Error("Missing S3/MinIO environment variables!");
}

// Configure the S3 client to use the MinIO endpoint
// Force path style is often required for MinIO
export const s3Client = new S3Client({
  endpoint: S3_ENDPOINT_URL,
  region: S3_REGION,
  credentials: {
    accessKeyId: S3_ACCESS_KEY!,
    secretAccessKey: S3_SECRET_KEY!,
  },
  forcePathStyle: true, // Important for MinIO
});

export const bucketName = S3_BUCKET_NAME!;

// --- Utility Functions --- //

/**
 * Generates a pre-signed URL for uploading a file directly to S3/MinIO.
 * @param key The desired object key (path/filename) in the bucket.
 * @param contentType The MIME type of the file being uploaded.
 * @param expiresIn Optional: URL validity duration in seconds (default: 3600 = 1 hour).
 * @param sizeLimit Optional: Maximum allowed upload size in bytes (default: 8MB as per PRD).
 * @returns The pre-signed URL string.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600, // Default 1 hour
  sizeLimit: number = 8 * 1024 * 1024 // Default 8MB
) {
  if (!s3Client || !bucketName) {
    throw new Error("S3 client or bucket name not configured");
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
    // ContentLength is usually set by the client performing the PUT,
    // but we can enforce a size limit here if the presigner supports it
    // or rely on backend validation after upload if needed.
    // For S3, we can set ContentLengthRange in policy if needed, but
    // MinIO might behave differently. Let's rely on client-side/post-upload validation for now.
  });

  try {
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: expiresIn,
      // Add conditions for size if possible/needed later
    });
    return url;
  } catch (error) {
    console.error("Error generating pre-signed upload URL:", error);
    throw new Error("Could not generate upload URL");
  }
}

/**
 * Uploads data (Buffer, Stream, Blob) directly to S3/MinIO from the backend.
 * 
 * @param key The desired object key (path/filename) in the bucket.
 * @param body The data to upload (Buffer, ReadableStream, Blob).
 * @param contentType The MIME type of the data.
 * @returns The S3 object key upon successful upload.
 * @throws An error if the upload fails.
 */
export async function uploadStreamToS3(
    key: string,
    body: Buffer | ReadableStream | Blob,
    contentType: string,
): Promise<string> { // Returns the key on success
    if (!s3Client || !bucketName) {
        throw new Error("S3 client or bucket name not configured");
    }

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        // ACL: 'public-read', // Optional: Set ACL if objects need to be publicly readable by default
    });

    try {
        console.log(`Uploading to S3/MinIO. Bucket: ${bucketName}, Key: ${key}, ContentType: ${contentType}`);
        await s3Client.send(command);
        console.log(`Successfully uploaded to ${key}`);
        // Optionally construct and return the full URL if needed
        // const publicUrl = `${process.env.S3_PUBLIC_URL}/${bucketName}/${key}`;
        return key; // Return the key for now
    } catch (error) {
        console.error(`Error uploading ${key} to S3/MinIO:`, error);
        throw new Error(`Could not upload object to S3/MinIO: ${error instanceof Error ? error.message : 'Unknown S3 error'}`);
    }
}

/**
 * Deletes an object from S3/MinIO.
 * 
 * @param key The key of the object to delete.
 * @throws An error if the deletion fails.
 */
export async function deleteS3Object(key: string): Promise<void> {
    if (!s3Client || !bucketName) {
        throw new Error("S3 client or bucket name not configured");
    }

    const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    try {
        console.log(`Deleting object from S3/MinIO. Bucket: ${bucketName}, Key: ${key}`);
        await s3Client.send(command);
        console.log(`Successfully deleted object: ${key}`);
    } catch (error) {
        // Check if error is because the object doesn't exist (NotFoundError in newer SDK versions)
        // For now, log the error but don't necessarily throw if it's just a non-existent key, 
        // as the compensation might run even if the asset wasn't fully saved.
        // Consider specific error handling based on SDK version if needed.
        console.error(`Error deleting object ${key} from S3/MinIO:`, error);
        // Rethrowing for now, workflow can decide how to handle compensation failures.
        throw new Error(`Could not delete object ${key} from S3/MinIO: ${error instanceof Error ? error.message : 'Unknown S3 error'}`);
    }
}

// Example placeholder for download URL function
// export async function getPresignedDownloadUrl(key: string, expiresIn: number = 3600) {
//   // ... implementation using GetObjectCommand ...
// } 