import OpenAI from 'openai';
// import { Readable } from 'stream'; // Remove unused import

const openAIApiKey = process.env.OPENAI_API_KEY;

if (!openAIApiKey) {
  console.warn(
    "Missing OPENAI_API_KEY environment variable. OpenAI API calls will fail."
  );
  // Consider throwing an error in production or during build if critical
  // throw new Error("Missing OPENAI_API_KEY environment variable!");
}

const openai = new OpenAI({
  apiKey: openAIApiKey,
});

// --- Constants --- //
// Choose the DALL-E model. DALL-E 3 is generally higher quality.
const DALL_E_MODEL = "dall-e-3"; // or "dall-e-2"
const IMAGE_SIZE = "1024x1024"; // Required size

// --- Image Generation Functions --- //

/**
 * Generates a comic book style avatar based on a text prompt using DALL-E.
 * Note: This function currently *only* uses the prompt.
 * To base it on the user's selfie, we'd likely need to use the editImage function.
 * @param prompt Detailed text prompt describing the desired avatar.
 * @returns URL of the generated image.
 */
export async function generateAvatarFromPrompt(prompt: string): Promise<string> {
  if (!openai.apiKey) {
    throw new Error("OpenAI API key not configured.");
  }

  try {
    const response = await openai.images.generate({
      model: DALL_E_MODEL,
      prompt: prompt, // Use the provided detailed prompt
      n: 1, // Generate one image
      size: IMAGE_SIZE,
      quality: "standard", // DALL-E 3 only supports standard (hd is better but costs more)
      response_format: "url", // Get a URL back
    });

    // Add check for response.data existence
    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      console.error("Invalid response from OpenAI API:", response);
      throw new Error("No image URL returned from OpenAI API.");
    }
    console.log("Generated image URL:", imageUrl);
    return imageUrl;

  } catch (error) {
    console.error("Error generating image with OpenAI:", error);
    const errorMessage = error instanceof OpenAI.APIError ? `${error.status} ${error.name}: ${error.message}` : String(error);
    throw new Error(`Failed to generate avatar: ${errorMessage}`);
  }
}

/**
 * Edits an existing image based on a prompt (e.g., transform selfie to comic style).
 * Placeholder - Requires fetching the image from storage.
 * @param imageKey The key of the original image in S3/MinIO storage.
 * @param prompt A text prompt describing the desired edit (e.g., "Transform into a full body comic book style avatar").
 * @param maskKey Optional: Key of a mask image for inpainting.
 * @returns URL of the edited image.
 */
// export async function editImage(imageKey: string, prompt: string, maskKey?: string): Promise<string> {
//   if (!openai.apiKey) {
//     throw new Error("OpenAI API key not configured.");
//   }

//   try {
      // 1. Fetch the image (and mask) from MinIO/S3
      // This needs functions in our storage package to get object streams/buffers
      // const imageStream: Readable = await getObjectStream(imageKey);
      // const maskStream: Readable | undefined = maskKey ? await getObjectStream(maskKey) : undefined;

      // TODO: Convert stream/buffer to the format OpenAI expects (e.g., File-like object)
      // This might involve using a helper or temporary file depending on the SDK's capabilities
      // const imageFile = await streamToFile(imageStream, 'input_image.png');
      // const maskFile = maskStream ? await streamToFile(maskStream, 'mask_image.png') : undefined;

//     const response = await openai.images.edit({
//       // Note: DALL-E 2 is required for edits/variations, DALL-E 3 does not support this API endpoint
//       // model: "dall-e-2",
//       image: imageFile, // Pass the fetched image file
//       mask: maskFile, // Pass the mask if provided
//       prompt: prompt,
//       n: 1,
//       size: IMAGE_SIZE,
//       response_format: "url",
//     });

//     const imageUrl = response.data[0]?.url;
//     if (!imageUrl) {
//       throw new Error("No edited image URL returned from OpenAI API.");
//     }
//     console.log("Edited image URL:", imageUrl);
//     return imageUrl;

//   } catch (error) {
//     console.error("Error editing image with OpenAI:", error);
//     const errorMessage = error instanceof OpenAI.APIError ? `${error.status} ${error.name}: ${error.message}` : String(error);
//     throw new Error(`Failed to edit image: ${errorMessage}`);
//   }
// } 