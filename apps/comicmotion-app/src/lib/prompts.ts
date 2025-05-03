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
export function getSceneGenerationPrompt(theme: string, avatarImageUrl: string): object {
    // This needs to return the full input object for the Replicate model
    // Placeholder - needs specific model input structure
    let themePrompt = `A scene in a ${theme} setting.`;
    if (theme === 'city') {
        themePrompt = "A dynamic comic book scene background of a bustling modern cityscape at daytime. Wide angle. HD 1920x1080.";
    } else if (theme === 'fantasy') {
        themePrompt = "A vibrant comic book scene background of an epic fantasy landscape with mountains and castles. Wide angle. HD 1920x1080.";
    } else if (theme === 'neon') {
        themePrompt = "A comic book scene background of a futuristic neon-lit cyberpunk city street at night. Wide angle. HD 1920x1080.";
    }

    // Example input structure (adjust based on actual Replicate model)
    return {
        prompt: themePrompt, 
        // Assuming the model takes an image input for the avatar
        image: avatarImageUrl, 
        width: 1920, 
        height: 1080,
        // Add other necessary model parameters
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