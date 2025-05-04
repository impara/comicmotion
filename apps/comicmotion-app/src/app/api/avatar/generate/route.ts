import { NextResponse } from 'next/server';
// import { generateAvatarFromPrompt } from '@/lib/openai';
import { PrismaClient, Prisma } from 'db'; // Import Prisma namespace for types
import { auth } from '@clerk/nextjs/server'; // Re-enable auth
import { getTemporalClient } from '@/lib/temporalClient'; // Import the Temporal client getter
import { openai } from 'lib-shared'; // Import the initialized OpenAI client from shared package

// TODO: Import and initialize Temporal Client properly
// import { Connection, Client } from '@temporalio/client';
// Placeholder for Temporal Client setup - this should be done centrally
// const temporalClient = new Client();

const prisma = new PrismaClient();

// Define constants for validation (matching client-side)
const MAX_FILE_SIZE_MB = 8;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Define a simple type for the response
interface GenerateApiResponse {
  avatarId: string;
}

export async function POST(request: Request): Promise<NextResponse<GenerateApiResponse | { error: string }>> {
  // Re-enable auth check and await it
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // TODO: Get internal userId from clerkId - Requires DB lookup or Clerk session token customization
  // For now, we MUST have a reliable way to link Clerk ID to DB ID. Using clerkId as placeholder DB ID for now.
  const userId = clerkId; // Using clerkId as placeholder DB ID - CHANGE THIS LATER
  if (!userId) { // Double check after potential lookup
      return NextResponse.json({ error: 'User ID not found after authentication.'}, { status: 403 });
  }

  try {
    const body = await request.json();
    const { imageKey, originalUrl, filename, contentType, size } = body;

    if (!imageKey || !originalUrl) {
        return NextResponse.json({ error: 'Missing imageKey or originalUrl' }, { status: 400 });
    }

    // --- Server-side File Size Validation ---
    if (typeof size !== 'number' || size <= 0) {
        return NextResponse.json({ error: 'Invalid or missing file size.' }, { status: 400 });
    }
    if (size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: `File size exceeds the ${MAX_FILE_SIZE_MB}MB limit.` }, { status: 400 });
    }
    // --- End File Size Validation ---

    // --- NSFW Moderation Check --- 
    try {
      console.log(`Checking image moderation for URL: ${originalUrl} (User: ${userId})`);
      const moderationResponse = await openai.moderations.create({
        input: originalUrl, // Use the direct image URL
      });
      const result = moderationResponse.results[0];

      if (result.flagged) {
          const flaggedCategories = Object.entries(result.categories)
                                        .filter(([, flagged]) => flagged)
                                        .map(([category]) => category)
                                        .join(', ');
          console.warn(`Image flagged for moderation (${flaggedCategories}). URL: ${originalUrl}, UserId: ${userId}`);
          return NextResponse.json({ error: `Image violates content policy: ${flaggedCategories}` }, { status: 400 });
      }
      console.log(`Image passed moderation check. URL: ${originalUrl}`);
      // TODO: Optionally store moderation scores `result.category_scores` in the Image record later

    } catch (moderationError) {
        console.error(`OpenAI Moderation API call failed for URL ${originalUrl} (User: ${userId}):`, moderationError);
        // Decide if this should block generation or just log the error
        // For now, let's block it to be safe.
        return NextResponse.json({ error: 'Failed to check image content policy.' }, { status: 500 });
    }
    // --- End Moderation Check --- 

    // --- Create Initial DB Records (Image and processing Avatar) ---
    // We need the IDs to return to the client for polling
    let avatarRecordId: string;
    let imageRecordId: string; // Need imageId for workflow args

    try {
        const initialRecord = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const imgRec = await tx.image.create({
            data: {
                userId: userId, // Use actual userId
                originalUrl: originalUrl,
                fileName: filename || imageKey.split('/').pop(),
                fileType: contentType,
                fileSize: size, // Store the validated file size
                // width: // TBD: Requires image processing to get dimensions
                // height: // TBD: Requires image processing to get dimensions
            }
          });
          const avatarRec = await tx.avatar.create({
            data: {
                userId: userId, // Use actual userId
                imageId: imgRec.id,
                status: 'queued', // Start as queued, generation happens elsewhere
                // avatarUrl will be updated later by the background job
            }
          });
          return { imageId: imgRec.id, avatarId: avatarRec.id };
        });
        avatarRecordId = initialRecord.avatarId;
        imageRecordId = initialRecord.imageId; // Store imageId
        console.log(`Created Image record: ${imageRecordId}, Avatar record: ${avatarRecordId} (status: queued) for User: ${userId}`);
    } catch (dbError) {
        console.error(`Database transaction failed for User ${userId}:`, dbError);
        // Check for specific Prisma errors if needed
        return NextResponse.json({ error: 'Failed to create initial generation records.' }, { status: 500 });
    }


    // --- Trigger Generation Asynchronously via Temporal --- 
    try {
      // Get the Temporal client instance
      const temporalClient = await getTemporalClient(); 
      
      console.log(`Initiating Temporal workflow for avatarId: ${avatarRecordId} (User: ${userId})`);
      
      // Define workflow name and arguments (adjust names if needed)
      const workflowName = 'generateAvatarWorkflow'; 
      const taskQueueName = 'avatar-generation';

      // Start the workflow
      await temporalClient.workflow.start(workflowName, { 
        taskQueue: taskQueueName, 
        workflowId: `avatar-${avatarRecordId}`, // Use avatar ID for unique workflow ID
        args: [{ // Pass necessary arguments to the workflow
            avatarId: avatarRecordId,
            imageId: imageRecordId, // Pass the created imageId
            userId: userId, // Use actual userId
            originalImageUrl: originalUrl 
        }], 
      });
     
     console.log(`Successfully started Temporal workflow '${workflowName}' with ID 'avatar-${avatarRecordId}' on task queue '${taskQueueName}' for User: ${userId}.`);

    } catch (temporalError) {
        console.error(`Failed to start Temporal workflow for avatarId ${avatarRecordId} (User: ${userId}):`, temporalError);
        // Compensation logic: Mark DB record as failed if workflow start fails
        try {
             await prisma.avatar.update({
                 where: { id: avatarRecordId },
                 data: { 
                     status: 'failed', 
                     error: `Workflow initiation failed: ${temporalError instanceof Error ? temporalError.message : 'Unknown error'}`
                 }
             });
             console.log(`Updated Avatar record ${avatarRecordId} status to 'failed' due to workflow start error (User: ${userId}).`);
        } catch (dbUpdateError) {
             console.error(`CRITICAL: Failed to update avatar ${avatarRecordId} status to failed after Temporal error (User: ${userId}):`, dbUpdateError);
             // Log this critical failure, manual intervention might be needed
        }
        // Return error response to the client
        return NextResponse.json({ error: 'Failed to start generation process.' }, { status: 500 });
    }

    // --- Return the ID for polling --- 
    // If workflow start was successful (or placeholder logging ran)
    return NextResponse.json({ avatarId: avatarRecordId });

  } catch (error) {
    console.error(`Error in generate route for User ${userId}:`, error);
    // Use const as message is not reassigned
    const message = 'Failed to initiate avatar generation.';
    // if (error instanceof Error) { // Keep this commented out - avoids exposing internal details
    //   // message = `Failed to initiate avatar generation: ${error.message}`; 
    // }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}