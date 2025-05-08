import Replicate from 'replicate';
import { getSceneGenerationPrompt } from './prompts';

// Initialize the Replicate client using the API token from environment variables
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

if (!process.env.REPLICATE_API_TOKEN) {
  console.warn('REPLICATE_API_TOKEN environment variable not set. Replicate API calls will fail.');
}

/**
 * Starts an avatar generation prediction on Replicate using GPT-Image-1.
 * TSD Step: 5.3 / A1
 * PRD Requirement: 6.2
 *
 * @param imageUrl The publicly accessible URL of the user's uploaded selfie.
 * @param prompt The generation prompt (potentially from shared prompts).
 * @returns The initial prediction object from Replicate.
 * @throws An error if the Replicate API call fails.
 */
export async function startAvatarGeneration(imageUrl: string, prompt: string) {
  if (!replicate.auth) {
      throw new Error('Replicate API token is not configured.');
  }

  // Use the model identifier directly as per user info (no version hash)
  const modelIdentifier = 'openai/gpt-image-1'; 
  // Removed splitting logic as no version hash is present
  // const modelVersion = modelIdentifier.split(':')[1]; 

  // Input structure based on user cURL example for openai/gpt-image-1
  // Note: The cURL example uses "input_images" - assuming the first is the selfie
  // and the second might be a style reference (which we don't have here).
  // We'll use just the selfie as the input image.
  // Also, the cURL doesn't specify width/height, relying on aspect_ratio.
  // Let's keep width/height for clarity, matching PRD requirement, but be aware model might ignore them.
  const input = {
      input_images: [imageUrl], // Array containing the user selfie URL
      prompt: prompt,          // Generation prompt
      aspect_ratio: "1:1",     // Match 1024x1024 requirement
      // width: 1024,          // Kept for documentation, but aspect_ratio might take precedence
      // height: 1024,         // Kept for documentation, but aspect_ratio might take precedence
      number_of_images: 1,     // Generate one image
      output_format: "png",    // Request PNG for consistency (or webp if preferred)
      quality: "auto",         // Default from cURL
      background: "auto",      // Default from cURL
      moderation: "auto",      // Default from cURL
      negative_prompt: "",     // Added: Default empty negative prompt
      num_inference_steps: 30, // Added: Default number of inference steps
      guidance_scale: 7.0,     // Added: Default CFG scale
      // openai_api_key: "",   // Leave empty as per cURL example
      openai_api_key: process.env.OPENAI_API_KEY, // Add the OpenAI API key from env
      // Add any other required parameters for the model
  };

  console.log(`Starting Replicate avatar prediction for model: ${modelIdentifier}`);
  console.log(`Input payload: ${JSON.stringify(input)}`); // Log the input

  try {
    const prediction = await replicate.predictions.create({
      // Pass the full model identifier when no version hash exists
      version: modelIdentifier, 
      input: input,
      // TODO: Consider webhook implementation (Task 8)
      // webhook: 'YOUR_WEBHOOK_URL',
      // webhook_events_filter: ['completed']
    });

    console.log(`Replicate avatar prediction started: ${prediction.id}`);
    // Immediately check for initial failure
    if (prediction.status === 'failed') {
        throw new Error(`Replicate prediction failed immediately: ${prediction.error}`);
    }
    
    return prediction; // Return the initial prediction object (contains ID for polling)

  } catch (error) {
    console.error('Error starting Replicate avatar prediction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    // TODO: Implement more specific error handling (Task 14)
    throw new Error(`Failed to start Replicate avatar generation: ${errorMessage}`);
  }
}

/**
 * Starts a scene generation prediction on Replicate.
 * 
 * @param theme The selected theme for the scene.
 * @param avatarImageUrl The URL of the user's generated avatar image.
 * @returns The initial prediction object from Replicate.
 * @throws An error if the Replicate API call fails.
 */
export async function startSceneGeneration(theme: string, avatarImageUrl: string) {
  if (!replicate.auth) {
      throw new Error('Replicate API token is not configured.');
  }

  // Target openai/gpt-image-1 for scene generation as well
  const modelIdentifier = 'openai/gpt-image-1'; 
  // No version hash needed per previous findings

  // Use getSceneGenerationPrompt to construct the input object, 
  // ensuring its output format matches openai/gpt-image-1 requirements.
  // We assume getSceneGenerationPrompt is updated or already returns 
  // a structure like { input_images: [avatarImageUrl], prompt: themedPrompt, ... }
  const inputFromPrompt = getSceneGenerationPrompt(theme, avatarImageUrl);

  // Merge the OpenAI API key into the input object
  const input = {
    ...inputFromPrompt,
    openai_api_key: process.env.OPENAI_API_KEY, // Add the OpenAI API key from env
  };

  // Log the actual input structure being sent
  console.log(`Starting Replicate scene prediction using model: ${modelIdentifier} with theme: ${theme}`);
  console.log(`Input payload for scene: ${JSON.stringify(input)}`); // Log the final input including API key

  try {
    const prediction = await replicate.predictions.create({
      version: modelIdentifier, // Pass full model name
      input: input,
      // TODO: Implement webhook for completion updates (Subtask 6.4 / Task 8)
      // webhook: 'YOUR_WEBHOOK_URL', 
      // webhook_events_filter: ['completed'] 
    });

    console.log(`Replicate scene prediction started: ${prediction.id}`);
    return prediction; // Return the initial prediction object
  } catch (error) {
    console.error('Error starting Replicate scene prediction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    // TODO: Implement more specific error handling (Task 14)
    // Make error message specific to scene generation
    throw new Error(`Failed to start Replicate scene generation using ${modelIdentifier}: ${errorMessage}`);
  }
}

/**
 * Retrieves the status of a Replicate prediction.
 * 
 * @param predictionId The ID of the prediction to check.
 * @returns The prediction object from Replicate.
 * @throws An error if the Replicate API call fails.
 */
export async function getPredictionStatus(predictionId: string) {
    if (!replicate.auth) {
        throw new Error('Replicate API token is not configured.');
    }
    
    try {
        const prediction = await replicate.predictions.get(predictionId);
        return prediction;
    } catch (error) {
        console.error(`Error fetching Replicate prediction status for ID ${predictionId}:`, error);
        throw new Error('Failed to fetch Replicate prediction status.');
    }
}

/**
 * Starts an animation generation prediction on Replicate using Minimax video-01-live.
 * 
 * @param sceneImageUrl The URL of the generated scene image (1920x1080).
 * @param durationSeconds The desired duration of the video (default: 6s, paid: 10s - // TODO: Implement parameterization 7.2).
 * @returns The initial prediction object from Replicate.
 * @throws An error if the Replicate API call fails.
 */
export async function startAnimationGeneration(sceneImageUrl: string, durationSeconds: number = 6) {
  if (!replicate.auth) {
    throw new Error('Replicate API token is not configured.');
  }

  // Use the correct model identifier and provided version hash
  const modelIdentifier = 'minimax/video-01-live:4bce7c1730a5fc582699fb7e630c2e39c3dd4ddb11ca87fa3b7f0fc52537dd09'; 
  const modelVersion = modelIdentifier.split(':')[1];

  // Construct the input for minimax/video-01-live
  // Note: The durationSeconds parameter is for internal tracking and database storage.
  // The minimax/video-01-live model itself does not accept a direct duration input;
  // it generates a video of a fixed standard length (approx. 6 seconds).
  const input = {
    first_frame_image: sceneImageUrl, 
    prompt: "Animate the scene with a walk-forward style and mild camera pan.", // Example prompt
    prompt_optimizer: true, 
    // No explicit duration field for this model. The passed 'durationSeconds' is for internal logic.
  };

  console.log(`Starting Replicate animation prediction for model: ${modelIdentifier}. Intended duration (internal): ${durationSeconds}s`);
  console.log(`Input payload: ${JSON.stringify(input)}`);

  try {
    const prediction = await replicate.predictions.create({
      version: modelVersion, 
      input: input,
      // TODO: Implement webhook for completion updates (part of Task 8)
      // webhook: 'YOUR_WEBHOOK_URL',
      // webhook_events_filter: ['completed']
    });

    console.log(`Replicate animation prediction started: ${prediction.id}`);
    return prediction; // Return the initial prediction object
  } catch (error) {
    console.error('Error starting Replicate animation prediction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    // TODO: Implement more specific error handling based on Replicate errors (7.6)
    throw new Error(`Failed to start Replicate animation generation: ${errorMessage}`);
  }
}
