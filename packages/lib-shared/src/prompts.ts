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

// Updated for openai/gpt-image-1 via Replicate (Task 6)
export function getSceneGenerationPrompt(theme: string, avatarImageUrl: string): object {
    let themeDescription = '';

    // Generate theme-specific descriptions
    switch (theme.toLowerCase()) {
        case 'city':
            themeDescription = "A dynamic comic book scene background of a bustling modern cityscape at daytime. Wide angle.";
            break;
        case 'fantasy':
            themeDescription = "A vibrant comic book scene background of an epic fantasy landscape with mountains and castles. Wide angle.";
            break;
        case 'neon':
            themeDescription = "A comic book scene background of a futuristic neon-lit cyberpunk city street at night. Wide angle.";
            break;
        default:
            console.warn(`Unknown theme: ${theme}. Using default scene description.`);
            themeDescription = "A generic comic book style background scene.";
    }

    // Construct the final prompt for openai/gpt-image-1
    // Instruct it to use the input image within the described scene
    const fullPrompt = `Visually integrate the character from the input image (respecting its original form and transparency) into a new scene with the background: \"${themeDescription}\". The final image should meticulously maintain the artistic style (e.g., line weight, coloring, shading, lighting, and overall comic book feel) of the provided input character. The character should appear naturally placed and coherent within the new background.`;

    // Return the input object matching the structure for openai/gpt-image-1 via Replicate
    // Derived from the cURL example and previous startAvatarGeneration update.
    return {
        input_images: [avatarImageUrl], // Pass the generated avatar URL
        prompt: fullPrompt, 
        aspect_ratio: "16:9", // Target 1920x1080 for scenes
        number_of_images: 1,
        output_format: "png", // Or "webp"
        quality: "auto",
        background: "auto",
        moderation: "auto",
        // Negative prompt isn't a direct parameter in the cURL example for this model
        // It might need to be incorporated into the main prompt if needed.
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