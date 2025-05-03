import { NextResponse } from 'next/server';
// import { generateAvatarFromPrompt } from '@/lib/openai';
import { PrismaClient, Prisma } from 'db'; // Import Prisma namespace for types
// import { auth } from '@clerk/nextjs/server';
import { getTemporalClient } from '@/lib/temporalClient'; // Import the Temporal client getter

// TODO: Import and initialize Temporal Client properly
// import { Connection, Client } from '@temporalio/client';
// Placeholder for Temporal Client setup - this should be done centrally
// const temporalClient = new Client();

const prisma = new PrismaClient();

// Define a simple type for the response
interface GenerateApiResponse {
  avatarId: string;
}

export async function POST(request: Request): Promise<NextResponse<GenerateApiResponse | { error: string }>> {
  // TODO: Add proper authentication check
  // const { userId: clerkId } = auth();
  // if (!clerkId) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }
  // TODO: Get internal userId from clerkId, assuming it exists for now
  const placeholderUserId = "user_placeholder_db_id"; 
  // const placeholderClerkId = "user_placeholder_clerk_id"; // Removed unused variable

  try {
    const body = await request.json();
    // TODO: The frontend needs to send more info than just the key
    // e.g., filename, contentType, size, and potentially the S3 URL after upload
    const { imageKey, originalUrl, filename, contentType, size } = body;

    if (!imageKey || !originalUrl) {
        return NextResponse.json({ error: 'Missing imageKey or originalUrl' }, { status: 400 });
    }

    // --- Create Initial DB Records (Image and processing Avatar) ---
    // We need the IDs to return to the client for polling
    let avatarRecordId: string;
    let imageRecordId: string; // Need imageId for workflow args

    try {
        const initialRecord = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const imgRec = await tx.image.create({
            data: {
                userId: placeholderUserId,
                originalUrl: originalUrl,
                fileName: filename || imageKey.split('/').pop(),
                fileType: contentType,
                fileSize: size,
            }
          });
          const avatarRec = await tx.avatar.create({
            data: {
                userId: placeholderUserId,
                imageId: imgRec.id,
                status: 'queued', // Start as queued, generation happens elsewhere
                // avatarUrl will be updated later by the background job
            }
          });
          return { imageId: imgRec.id, avatarId: avatarRec.id };
        });
        avatarRecordId = initialRecord.avatarId;
        imageRecordId = initialRecord.imageId; // Store imageId
        console.log(`Created Image record: ${imageRecordId}, Avatar record: ${avatarRecordId} (status: queued)`);
    } catch (dbError) {
        console.error("Database transaction failed:", dbError);
        // Check for specific Prisma errors if needed
        return NextResponse.json({ error: 'Failed to create initial generation records.' }, { status: 500 });
    }


    // --- Trigger Generation Asynchronously via Temporal --- 
    try {
      // Get the Temporal client instance
      const temporalClient = await getTemporalClient(); 
      
      console.log(`Initiating Temporal workflow for avatarId: ${avatarRecordId}`);
      
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
            userId: placeholderUserId, 
            originalImageUrl: originalUrl 
        }], 
      });
     
     console.log(`Successfully started Temporal workflow '${workflowName}' with ID 'avatar-${avatarRecordId}' on task queue '${taskQueueName}'.`);

    } catch (temporalError) {
        console.error(`Failed to start Temporal workflow for avatarId ${avatarRecordId}:`, temporalError);
        // Compensation logic: Mark DB record as failed if workflow start fails
        try {
             await prisma.avatar.update({
                 where: { id: avatarRecordId },
                 data: { 
                     status: 'failed', 
                     error: `Workflow initiation failed: ${temporalError instanceof Error ? temporalError.message : 'Unknown error'}`
                 }
             });
             console.log(`Updated Avatar record ${avatarRecordId} status to 'failed' due to workflow start error.`);
        } catch (dbUpdateError) {
             console.error(`CRITICAL: Failed to update avatar ${avatarRecordId} status to failed after Temporal error:`, dbUpdateError);
             // Log this critical failure, manual intervention might be needed
        }
        // Return error response to the client
        return NextResponse.json({ error: 'Failed to start generation process.' }, { status: 500 });
    }

    // --- Return the ID for polling --- 
    // If workflow start was successful (or placeholder logging ran)
    return NextResponse.json({ avatarId: avatarRecordId });

  } catch (error) {
    console.error("Error in generate route:", error);
    // Use const as message is not reassigned
    const message = 'Failed to initiate avatar generation.';
    // if (error instanceof Error) { // Keep this commented out - avoids exposing internal details
    //   // message = `Failed to initiate avatar generation: ${error.message}`; 
    // }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}