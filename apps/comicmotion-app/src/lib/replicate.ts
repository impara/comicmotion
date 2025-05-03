import Replicate from "replicate";

const replicateToken = process.env.REPLICATE_API_TOKEN;

if (!replicateToken) {
  console.error("Missing REPLICATE_API_TOKEN environment variable!");
  // Optionally throw an error during server startup if critical
  // throw new Error("Missing REPLICATE_API_TOKEN environment variable!");
}

const replicate = new Replicate({
  auth: replicateToken,
});

// Define the model identifier for GPT-Image-1 (check Replicate docs for the exact ID)
// This is a placeholder - replace with the actual model string
const GPT_IMAGE_MODEL = "stability-ai/stable-diffusion:db21e45d3f7023abc2a46ee38a23973f6dce16bb082a930b0c49861f96d1e5bf"; // Example SD model, find GPT-Image-1

/**
 * Initiates the avatar generation process on Replicate.
 * @param imageUrl The publicly accessible URL of the user's uploaded selfie.
 * @returns The Replicate prediction ID.
 */
export async function startAvatarGeneration(imageUrl: string): Promise<string> {
  if (!replicateToken) {
    throw new Error("Replicate API token not configured");
  }

  try {
    const prediction = await replicate.predictions.create({
      // Use the correct model version for GPT-Image-1
      version: GPT_IMAGE_MODEL.split(':')[1], 
      input: {
        // Input parameters specific to GPT-Image-1 model
        // These are examples, consult the model's documentation on Replicate
        image: imageUrl,
        prompt: "full body comic book style avatar, high resolution, clear features", // Example prompt
        // Add other necessary parameters like width, height, etc.
        width: 1024,
        height: 1024,
        // ... other model specific params
      },
      // webhook: "YOUR_WEBHOOK_URL", // Optional: for webhook completion notification
      // webhook_events_filter: ["completed"],
    });

    if (prediction.status === 'failed') {
        throw new Error(`Replicate prediction failed immediately: ${prediction.error}`);
    }

    // Return the prediction ID for polling
    return prediction.id;

  } catch (error) {
    console.error("Error starting Replicate prediction:", error);
    // Re-throw or handle more gracefully
    throw new Error(`Failed to start avatar generation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Gets the status and result of a Replicate prediction.
 * @param predictionId The ID of the Replicate prediction.
 * @returns The prediction object from Replicate.
 */
export async function getPredictionStatus(predictionId: string) {
   if (!replicateToken) {
    throw new Error("Replicate API token not configured");
  }
  try {
    const prediction = await replicate.predictions.get(predictionId);
    return prediction;
  } catch (error) {
     console.error("Error fetching Replicate prediction status:", error);
     throw new Error(`Failed to get prediction status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Add more functions as needed (e.g., list predictions) 