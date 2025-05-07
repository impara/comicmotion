import { Webhook } from 'svix'
// import { headers } from 'next/headers' // No longer needed if using req.headers
import { WebhookEvent } from '@clerk/nextjs/server'
import { users } from "@clerk/clerk-sdk-node"; // Import Clerk SDK users
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

  if (eventType === 'user.created') {
    const { id: clerkId, email_addresses, created_at, updated_at, public_metadata } = evt.data;

    const primaryEmail = email_addresses?.find(email => email.id === evt.data.primary_email_address_id)?.email_address;

    if (!primaryEmail) {
        console.warn(`Webhook Error: User ${clerkId} (created) has no primary email address.`);
        return new Response('Webhook Error: No primary email address found for user.', { status: 400 });
    }

    try {
      // Create the user in Prisma
      await prisma.user.create({
        data: {
          clerkId: clerkId,
          email: primaryEmail,
          credits: 5, // Default credits for new user
          createdAt: new Date(created_at),
          updatedAt: new Date(updated_at),
        },
      });
      console.log(`Successfully created user in DB with Clerk ID: ${clerkId}`);

      // Set default role in Clerk publicMetadata
      try {
        await users.updateUser(clerkId, { publicMetadata: { ...public_metadata, role: "free" } });
        console.log(`Successfully set role='free' in Clerk publicMetadata for user ${clerkId}`);
      } catch (clerkError) {
        console.error(`Clerk API error setting role for user ${clerkId}:`, clerkError);
        // Don't fail the whole webhook for this, but log it
      }

    } catch (dbError) {
      console.error(`Database error creating user ${clerkId}:`, dbError);
      return new Response('Error occurred: Failed to create user in database.', {
        status: 500
      });
    }
  } else if (eventType === 'user.updated') {
    const { id: clerkId, email_addresses, updated_at } = evt.data;
    const primaryEmail = email_addresses?.find(email => email.id === evt.data.primary_email_address_id)?.email_address;

    if (!primaryEmail) {
        console.warn(`Webhook Error: User ${clerkId} (updated) has no primary email address.`);
        // Potentially skip update or handle as error
        return new Response('Webhook Error: No primary email address found for user.', { status: 400 });
    }

    try {
      // Update the user in Prisma
      await prisma.user.update({
        where: { clerkId: clerkId },
        data: {
          email: primaryEmail,
          updatedAt: new Date(updated_at),
        },
      });
      console.log(`Successfully updated user in DB with Clerk ID: ${clerkId}`);
      // Note: Role updates are typically handled by subscription events or admin actions,
      // not general user.updated events, to avoid overwriting existing roles.
    } catch (dbError) {
      // Handle case where user might not exist in DB yet if webhook ordering is unusual
      if (dbError instanceof Prisma.PrismaClientKnownRequestError && dbError.code === 'P2025') {
        console.warn(`User ${clerkId} not found in DB during user.updated event. Consider creating or logging.`);
        // Optionally, you could attempt to create the user here if that's desired behavior
      } else {
        console.error(`Database error updating user ${clerkId}:`, dbError);
        return new Response('Error occurred: Failed to update user in database.', {
            status: 500
        });
      }
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