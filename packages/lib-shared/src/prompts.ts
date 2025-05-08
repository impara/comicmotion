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
        aspect_ratio: "3:2", // Changed from "16:9" to a valid option
        number_of_images: 1,
        output_format: "png", // Or "webp"
        quality: "auto",
        background: "auto",
        moderation: "auto",
        // Negative prompt isn't a direct parameter in the cURL example for this model
        // It might need to be incorporated into the main prompt if needed.
    };
}

// --- Replicate Video Generation (Storyboard-Driven) --- //

interface StoryboardShot {
  generateText: (inputs: AnimationInputData, shotParams?: any) => string;
}

interface StoryboardTemplate {
  id: string;
  name: string;
  shots: StoryboardShot[];
  adaptForDuration?: (shotTexts: string[], durationSeconds: number) => string[];
}

const simpleActionRevealTemplate: StoryboardTemplate = {
  id: 'simpleActionReveal',
  name: 'Simple Action Reveal',
  shots: [
    { // Shot 1: Intro
      generateText: (inputs) => `The character, ${inputs.characterDescription || 'as seen in the image'}, stands confidently, looking ${inputs.userEmotion || 'neutral'}. ${inputs.themeDetails?.setting || 'In a fitting environment'}.`
    },
    { // Shot 2: Action Start
      generateText: (inputs) => `They begin to ${inputs.userAction || 'move'}. The camera subtly draws closer, focusing on their intense expression.`
    },
    { // Shot 3: Climax/SFX
      generateText: (inputs) => `At the peak of the action, ${inputs.userSfx ? `the words '${inputs.userSfx.toUpperCase()}' flash brightly! ` : ''}A surge of energy is visible.`
    },
    { // Shot 4: Reaction/Reveal
      generateText: (inputs) => `A look of surprise crosses their face as ${inputs.themeDetails?.revealElement || 'something unexpected'} is revealed before them.`
    },
    { // Shot 5: Outro
      generateText: (inputs) => `They gaze at the ${inputs.themeDetails?.revealedElementName || 'revelation'} in awe as the scene gently fades.`
    },
  ],
  adaptForDuration: (shotTexts, durationSeconds) => {
    if (durationSeconds > 8) { // Arbitrary threshold for "longer"
      if (shotTexts[1]) shotTexts[1] += " Every detail of their movement is clear.";
      if (shotTexts[3]) shotTexts[3] += " The air crackles around the revealed object.";
    }
    return shotTexts;
  }
};

const storyboardTemplates: Record<string, StoryboardTemplate> = {
  simpleActionReveal: simpleActionRevealTemplate,
  // Add more templates here
};

interface ThemeSpecificDetails {
  setting?: string;
  revealElement?: string;
  revealedElementName?: string;
}

export interface AnimationInputData { // Exporting for use in other parts of the application if needed
  characterDescription?: string;
  theme: string;
  userAction: string;
  userEmotion: string;
  userSfx?: string;
  durationSeconds: number;
  // themeDetails will be populated internally by getAnimationGenerationInput
  themeDetails?: ThemeSpecificDetails; 
}

export function getAnimationGenerationInput(
  sceneImageUrl: string,
  inputs: AnimationInputData,
  templateId: string = 'simpleActionReveal'
): object {

  const selectedTemplate = storyboardTemplates[templateId];
  if (!selectedTemplate) {
    console.warn(`Storyboard template "${templateId}" not found. Using default 'simpleActionReveal'.`);
    // Fallback to default if templateId is invalid or not found
    const defaultTemplate = storyboardTemplates['simpleActionReveal'];
    if (!defaultTemplate) { // Should not happen if simpleActionReveal is always defined
        throw new Error("Default storyboard template 'simpleActionReveal' is missing.");
    }
    // In a real scenario, you might want to throw an error or handle this more gracefully
    // For now, let's proceed with a warning and use the default if the selected one isn't found.
    // This part of the logic might need refinement based on how template selection is handled upstream.
  }

  let currentTemplate = selectedTemplate || storyboardTemplates['simpleActionReveal'];
  if (!currentTemplate) { // Final check, mainly for type safety if defaultTemplate was also undefined
    throw new Error("Could not resolve a storyboard template.");
  }


  let populatedThemeDetails: ThemeSpecificDetails = {};
  switch (inputs.theme.toLowerCase()) {
    case 'city':
      populatedThemeDetails = { setting: "In a bustling downtown area,", revealElement: "a hidden alleyway entrance", revealedElementName: "alleyway" };
      break;
    case 'fantasy':
      populatedThemeDetails = { setting: "In an ancient, mystical forest,", revealElement: "a glowing, ancient rune stone", revealedElementName: "rune stone" };
      break;
    case 'neon':
      populatedThemeDetails = { setting: "On a rain-slicked cyberpunk street,", revealElement: "a flickering, secret data port", revealedElementName: "data port" };
      break;
    default:
      console.warn(`No specific theme details for theme: ${inputs.theme}. Using generic descriptions.`);
      populatedThemeDetails = { setting: "In a fitting environment,", revealElement: "something unexpected", revealedElementName: "revelation" };
  }

  const fullInputs = { ...inputs, themeDetails: populatedThemeDetails };

  let shotTexts = currentTemplate.shots.map(shot => shot.generateText(fullInputs));

  if (currentTemplate.adaptForDuration) {
    shotTexts = currentTemplate.adaptForDuration(shotTexts, inputs.durationSeconds);
  }

  const narrativePrompt = shotTexts.join(" Then, "); 

    return {
    first_frame_image: sceneImageUrl,
    prompt: narrativePrompt,
    prompt_optimizer: true,
    };
} 