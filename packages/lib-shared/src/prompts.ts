/**
 * Prompts for AI image generation services.
 */

// --- DALL-E Avatar Generation --- //

// TODO: Refine this prompt based on testing (Subtask 4.2)
// Consider adding negative prompts, style keywords, or details from the user selfie if applicable.
const BASE_AVATAR_PROMPT = 
    "Generate a full-body character avatar in a vibrant, modern American comic book style. " +
    "The character should be standing facing forward. " +
    "Clear linework, dynamic shading, 1024x1024 resolution. " +
    "No text, speech bubbles, or background elements.";

// Example of how you might structure prompts with options
interface AvatarPromptOptions {
    style?: 'modern' | 'classic' | 'manga'; // Example style option
    negativePrompt?: string;
    // Add other parameters as needed
}

export function getAvatarGenerationPrompt(options?: AvatarPromptOptions): string {
    // Use const as it's not reassigned here (logic to modify is commented out)
    const prompt = BASE_AVATAR_PROMPT;
    // TODO: Modify prompt based on options if provided
    if (options?.style) {
        // Example: prepend style
        // prompt = `${options.style} comic book style, ${prompt}`;
    }
    if (options?.negativePrompt) {
        // prompt = `${prompt} --no ${options.negativePrompt}`; // Example negative prompt format
    }
    return prompt;
}

// --- Replicate Scene Generation --- //

// TODO: Define prompts for different themes (city, fantasy, neon) - Subtask 6.2
// Refined based on Subtask 5.4
export function getSceneGenerationPrompt(theme: string, avatarImageUrl: string): object {
    // This needs to return the full input object for the Replicate model
    // Placeholder - needs specific model input structure. Adjust based on the actual Replicate model used in Task 6.
    let basePrompt = '';
    let negativePrompt = 'text, words, letters, signature, watermark, deformed, blurry, low quality'; // Common negative prompt

    switch (theme.toLowerCase()) {
        case 'city':
            basePrompt = "A dynamic comic book scene background of a bustling modern cityscape at daytime. Wide angle.";
            break;
        case 'fantasy':
            basePrompt = "A vibrant comic book scene background of an epic fantasy landscape with mountains and castles. Wide angle.";
            break;
        case 'neon':
            basePrompt = "A comic book scene background of a futuristic neon-lit cyberpunk city street at night. Wide angle.";
            break;
        default:
            console.warn(`Unknown theme: ${theme}. Using default prompt.`);
            basePrompt = "A generic comic book style background scene.";
    }

    const fullPrompt = `${basePrompt} Featuring the character from the input image composited naturally into the scene. HD 1920x1080.`;

    // Example input structure (adjust based on actual Replicate model, e.g., Stability AI SDXL)
    // Consult the specific Replicate model documentation for exact parameters.
    return {
        prompt: fullPrompt, 
        negative_prompt: negativePrompt,
        image: avatarImageUrl, // Assuming the model takes an input image for the character
        width: 1920, // Required output size
        height: 1080, // Required output size
        num_inference_steps: 30, // Example parameter, adjust as needed
        guidance_scale: 7.5,     // Example parameter, adjust as needed
        // Add other necessary model parameters (e.g., scheduler, seed)
    };
}

// --- Replicate Video Generation --- //

// TODO: Define input parameters for video generation - Subtask 7.1
export function getVideoGenerationInput(sceneImageUrl: string, durationSeconds: number): object {
    // Placeholder - needs specific model input structure for video-01-live
    return {
        image: sceneImageUrl,
        animation_style: 'walk-forward', // Default from PRD
        camera_pan: 'mild', // Default from PRD
        duration: durationSeconds,
        fps: 30, // Required output fps
        // Add other necessary model parameters
    };
} 