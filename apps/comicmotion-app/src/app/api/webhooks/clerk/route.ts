import { Webhook } from 'svix'
// import { headers } from 'next/headers' // No longer needed if using req.headers
import { WebhookEvent } from '@clerk/nextjs/server'
import { PrismaClient, Prisma } from 'db'; // Assuming 'db' maps to your Prisma package & import Prisma namespace

const prisma = new PrismaClient();

// Log statement to confirm environment variable is loaded (optional, remove in production)
console.log('CLERK_WEBHOOK_SECRET:', process.env.CLERK_WEBHOOK_SECRET ? 'Loaded' : 'MISSING!');

export async function POST(req: Request) {
  // You can find this in the Clerk Dashboard -> Webhooks -> choose the webhook
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.error('Error: CLERK_WEBHOOK_SECRET is not set in environment variables.');
    return new Response('Error occurred: Webhook secret not configured.', {
      status: 500
    })
  }

  // Get the headers from the request object
  // const headerPayload = headers(); // Using req.headers instead
  const svix_id = req.headers.get("svix-id");
  const svix_timestamp = req.headers.get("svix-timestamp");
  const svix_signature = req.headers.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('Error: Missing svix headers');
    return new Response('Error occurred: Missing svix headers', {
      status: 400
    })
  }

  // Get the body
  const payload = await req.json()
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occurred: Failed to verify webhook', {
      status: 400
    })
  }

  // Get the ID and type
  const { id } = evt.data;
  const eventType = evt.type;

  console.log(`Webhook with an ID of ${id} and type of ${eventType} received.`);
  // console.log('Webhook body:', body); // Optional: Log the full body for debugging

  // --- Handle Specific Events ---

  if (eventType === 'user.created' || eventType === 'user.updated') {
    const { id: clerkId, email_addresses, created_at, updated_at } = evt.data;

    // Assuming the primary email address is the one to store
    const primaryEmail = email_addresses?.find(email => email.id === evt.data.primary_email_address_id)?.email_address;

    if (!primaryEmail) {
        console.warn(`Webhook Error: User ${clerkId} has no primary email address.`);
        // Decide if you want to proceed without email or return an error
        // For now, we'll skip the update if no primary email is found
         return new Response('Webhook Error: No primary email address found for user.', { status: 400 });
    }

    try {
      // Upsert the user: Create if not exists, update if exists
      await prisma.user.upsert({
        where: { clerkId: clerkId },
        update: {
          // Fields to update on existing user
          email: primaryEmail,
          updatedAt: new Date(updated_at), // Use timestamp from Clerk event
          // Add other fields to update if needed (e.g., username, profile image url)
          // Be cautious about overwriting fields like 'credits' unless intended
        },
        create: {
          // Fields to set when creating a new user
          clerkId: clerkId,
          email: primaryEmail,
          credits: 5, // Default credits for new user as per PRD/Schema
          createdAt: new Date(created_at), // Use timestamp from Clerk event
          updatedAt: new Date(updated_at),
          // Add other default fields if needed
        },
      });
      console.log(`Successfully upserted user with Clerk ID: ${clerkId}`);
    } catch (dbError) {
      console.error(`Database error upserting user ${clerkId}:`, dbError);
      return new Response('Error occurred: Failed to update database.', {
        status: 500
      })
    }
  } else if (eventType === 'user.deleted') {
    const { id: clerkId } = evt.data;
     if (!clerkId) {
         console.error('Error: Missing clerkId for user.deleted event.');
         return new Response('Error occurred: Missing clerkId', { status: 400 });
     }
     try {
         // Optionally handle user deletion synchronization
         // Be careful with cascading deletes or foreign key constraints
         console.log(`Received user.deleted event for Clerk ID: ${clerkId}. Deleting user from local DB.`);
         // Example: Delete the user. Add error handling and consider related data.
         await prisma.user.delete({
             where: { clerkId: clerkId },
         });
         console.log(`Successfully deleted user with Clerk ID: ${clerkId}`);

     } catch (dbError) {
        // Prisma's P2025 code indicates record not found, which is okay for deletion
        if (dbError instanceof Prisma.PrismaClientKnownRequestError && dbError.code === 'P2025') {
            console.log(`User with Clerk ID ${clerkId} not found in local DB for deletion.`);
        } else {
            console.error(`Database error deleting user ${clerkId}:`, dbError);
            // Don't necessarily block the webhook response for deletion errors unless critical
            // return new Response('Error occurred: Failed to delete user from database.', { status: 500 });
        }
     }

  } else {
    console.log(`Unhandled webhook event type: ${eventType}`);
  }

  // --- End Event Handling ---

  return new Response('', { status: 200 })
} 