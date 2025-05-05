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
  const { userId: clerkId } = await auth(); // Renamed to clerkId for clarity
  if (!clerkId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // --- Look up internal database user ID from Clerk ID ---
  let dbUser;
  try {
    dbUser = await prisma.user.findUnique({
      where: { clerkId: clerkId }, // Find user by their Clerk ID
      select: { id: true }, // Only select the internal database ID
    });

    if (!dbUser) {
        // This case should ideally be handled by webhooks creating the user on signup.
        // If no webhook, you might choose to create the user here, but it's less robust.
        console.error(`User not found in DB for Clerk ID: ${clerkId}. Ensure user sync (e.g., webhooks) is working.`);
        return NextResponse.json({ error: 'User profile not found.'}, { status: 404 });
    }
  } catch (dbLookupError) {
      console.error(`Database error looking up user for Clerk ID ${clerkId}:`, dbLookupError);
      return NextResponse.json({ error: 'Failed to retrieve user profile.'}, { status: 500 });
  }

  const internalUserId = dbUser.id; // Use the internal database ID
  // --- End User ID Lookup ---


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
      console.log(`Checking image moderation for URL: ${originalUrl} (ClerkID: ${clerkId})`);
      const moderationResponse = await openai.moderations.create({
        input: originalUrl, 
      });
      const result = moderationResponse.results[0];

      if (result.flagged) {
          const flaggedCategories = Object.entries(result.categories)
                                        .filter(([, flagged]) => flagged)
                                        .map(([category]) => category)
                                        .join(', ');
          console.warn(`Image flagged for moderation (${flaggedCategories}). URL: ${originalUrl}, ClerkID: ${clerkId}`);
          return NextResponse.json({ error: `Image violates content policy: ${flaggedCategories}` }, { status: 400 });
      }
      console.log(`Image passed moderation check. URL: ${originalUrl}`);
      // TODO: Optionally store moderation scores `result.category_scores` in the Image record later

    } catch (moderationError) {
        console.error(`OpenAI Moderation API call failed for URL ${originalUrl} (ClerkID: ${clerkId}):`, moderationError);
        return NextResponse.json({ error: 'Failed to check image content policy.' }, { status: 500 });
    }
    // --- End Moderation Check --- 

    // --- Create Initial DB Records (Image and processing Avatar) ---
    let avatarRecordId: string;
    let imageRecordId: string; 

    try {
        const initialRecord = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const imgRec = await tx.image.create({
            data: {
                userId: internalUserId, // <<< USE INTERNAL DB ID HERE
                originalUrl: originalUrl,
                fileName: filename || imageKey.split('/').pop(),
                fileType: contentType,
                fileSize: size, 
            }
          });
          const avatarRec = await tx.avatar.create({
            data: {
                userId: internalUserId, // <<< USE INTERNAL DB ID HERE
                imageId: imgRec.id,
                status: 'queued', 
            }
          });
          return { imageId: imgRec.id, avatarId: avatarRec.id };
        });
        avatarRecordId = initialRecord.avatarId;
        imageRecordId = initialRecord.imageId; 
        console.log(`Created Image record: ${imageRecordId}, Avatar record: ${avatarRecordId} (status: queued) for DB User ID: ${internalUserId} (ClerkID: ${clerkId})`);
    } catch (dbError) {
        console.error(`Database transaction failed for DB User ID ${internalUserId} (ClerkID: ${clerkId}):`, dbError);
        return NextResponse.json({ error: 'Failed to create initial generation records.' }, { status: 500 });
    }


    // --- Trigger Generation Asynchronously via Temporal --- 
    try {
      const temporalClient = await getTemporalClient(); 
      
      console.log(`Initiating Temporal workflow for avatarId: ${avatarRecordId} (DB User ID: ${internalUserId}, ClerkID: ${clerkId})`);
      
      const workflowName = 'generateAvatarWorkflow'; 
      const taskQueueName = 'avatar-generation';

      await temporalClient.workflow.start(workflowName, { 
        taskQueue: taskQueueName, 
        workflowId: `avatar-${avatarRecordId}`, 
        args: [{ 
            avatarId: avatarRecordId,
            imageId: imageRecordId, 
            userId: internalUserId, // <<< PASS INTERNAL DB ID TO WORKFLOW
            originalImageUrl: originalUrl 
        }], 
      });
     
     console.log(`Successfully started Temporal workflow '${workflowName}' with ID 'avatar-${avatarRecordId}' on task queue '${taskQueueName}' for DB User ID: ${internalUserId} (ClerkID: ${clerkId}).`);

    } catch (temporalError) {
        console.error(`Failed to start Temporal workflow for avatarId ${avatarRecordId} (DB User ID: ${internalUserId}, ClerkID: ${clerkId}):`, temporalError);
        // Compensation logic: Mark DB record as failed if workflow start fails
        try {
             await prisma.avatar.update({
                 where: { id: avatarRecordId },
                 data: { 
                     status: 'failed', 
                     error: `Workflow initiation failed: ${temporalError instanceof Error ? temporalError.message : 'Unknown error'}`
                 }
             });
             console.log(`Updated Avatar record ${avatarRecordId} status to 'failed' due to workflow start error (ClerkID: ${clerkId}).`);
        } catch (dbUpdateError) {
             console.error(`CRITICAL: Failed to update avatar ${avatarRecordId} status to failed after Temporal error (ClerkID: ${clerkId}):`, dbUpdateError);
             // Log this critical failure, manual intervention might be needed
        }
        // Return error response to the client
        return NextResponse.json({ error: 'Failed to start generation process.' }, { status: 500 });
    }

    // --- Return the ID for polling --- 
    return NextResponse.json({ avatarId: avatarRecordId });

  } catch (error) {
    console.error(`Error in generate route for Clerk ID ${clerkId}:`, error);
    const message = 'Failed to initiate avatar generation.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}