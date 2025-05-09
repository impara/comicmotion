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
  cameraPath?: string; // Added for explicit camera instructions
  sfxText?: (inputs: AnimationInputData) => string | null; // Added for dynamic SFX
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
      generateText: (inputs) => {
        let stanceDescription = "stands confidently";
        switch (inputs.userEmotion?.toLowerCase()) {
          case 'angry': stanceDescription = "stands rigidly, radiating tension"; break;
          case 'happy': stanceDescription = "stands with an open, cheerful posture"; break;
          case 'sad': stanceDescription = "stands with a somber, downcast air"; break;
          case 'excited': stanceDescription = "is visibly buzzing with energy, poised for action"; break;
          case 'mysterious': stanceDescription = "stands shrouded in an enigmatic aura"; break;
          case 'calm': stanceDescription = "stands with a serene and composed demeanor"; break;
        }
        return `The character, ${inputs.characterDescription || 'a dynamic figure'}, ${stanceDescription}. Their expression is ${inputs.userEmotion || 'neutral and focused'}. They are set against ${inputs.themeDetails?.setting || 'a fitting and detailed environment'}.`;
      },
      cameraPath: "Medium shot, establishing the character and their immediate surroundings. Slight, slow zoom in.",
      sfxText: () => null,
    },
    { // Shot 2: Action Start
      generateText: (inputs) => {
        let actionPrefix = "With clear intent,";
        switch (inputs.userEmotion?.toLowerCase()) {
          case 'angry': actionPrefix = "With fiery determination,"; break;
          case 'happy': actionPrefix = "With joyful enthusiasm,"; break;
          case 'sad': actionPrefix = "With a heavy heart,"; break;
          case 'excited': actionPrefix = "With palpable excitement,"; break;
          case 'mysterious': actionPrefix = "With a secretive air,"; break;
          case 'calm': actionPrefix = "With calm precision,"; break;
        }
        let movementDescription = "Their body language shows determination and focus as they begin to move.";
        switch (inputs.userEmotion?.toLowerCase()) {
            case 'angry': movementDescription = "Their movements are sharp and forceful as they surge into action."; break;
            case 'happy': movementDescription = "They begin to move with a light, energetic bounce."; break;
            case 'sad': movementDescription = "They begin to move slowly, hesitantly."; break;
            case 'excited': movementDescription = "They launch into motion with eager, quick movements."; break;
            case 'mysterious': movementDescription = "They begin to move stealthily, with an air of intrigue."; break;
            case 'calm': movementDescription = "They begin to move with smooth, controlled grace."; break;
        }
        return `${actionPrefix} the character initiates their ${inputs.userAction || 'action'}. ${movementDescription}`;
      },
      cameraPath: "Dynamic eye-level shot, tracking closely with the character as they start their action.",
      sfxText: () => null,
    },
    { // Shot 3: Climax/SFX
      generateText: (inputs) => {
        let climaxFlavor = "unfolds dramatically";
        switch (inputs.userEmotion?.toLowerCase()) {
          case 'angry': climaxFlavor = "erupts explosively"; break;
          case 'happy': climaxFlavor = "sparkles with joy"; break;
          case 'sad': climaxFlavor = "unfolds with a poignant intensity"; break;
          case 'excited': climaxFlavor = "bursts forth with thrilling energy"; break;
          case 'mysterious': climaxFlavor = "materializes with cryptic power"; break;
          case 'calm': climaxFlavor = "manifests with quiet power"; break;
        }
        return `At the peak of the ${inputs.userAction || 'action'}, a visible surge of energy or a key moment ${climaxFlavor}.`;
      },
      cameraPath: "Impactful close-up on the character or the focal point of the action, emphasizing the climax.",
      sfxText: (inputs) => inputs.userSfx ? `${inputs.userSfx.toUpperCase()}! Comic style.` : null,
    },
    { // Shot 4: Reaction/Reveal
      generateText: (inputs) => `Their eyes widen, expression shifting to clear surprise as ${inputs.themeDetails?.revealElement || 'something truly unexpected'} is dramatically revealed before them.`,
      cameraPath: "Reverse shot from behind the character, showing their surprised expression and the grand reveal of the ${inputs.themeDetails?.revealedElementName || 'element'}.",
      sfxText: () => null,
    },
    { // Shot 5: Outro
      generateText: (inputs) => `The character remains fixed on the ${inputs.themeDetails?.revealedElementName || 'revelation'}, their initial surprise giving way to awe or contemplation, as the scene slowly fades.`,
      cameraPath: "Wide shot, holding on the character and the revealed element, conveying the impact of the moment. Slow fade to black.",
      sfxText: () => null,
    },
  ],
  adaptForDuration: (shotTexts, durationSeconds) => {
    if (durationSeconds > 8) { // For 10-second animations
      if (shotTexts[0]) shotTexts[0] += " The atmosphere is charged with anticipation.";
      if (shotTexts[1]) shotTexts[1] += " Every muscle is coiled, ready for what comes next. Their movement is precise and powerful.";
      if (shotTexts[2]) shotTexts[2] += " The effect is visually stunning and leaves a lasting impression.";
      if (shotTexts[3]) shotTexts[3] += " The scale of the reveal is breathtaking.";
      if (shotTexts[4]) shotTexts[4] += " The significance of what they've witnessed hangs in the air.";
    }
    return shotTexts;
  }
};

const characterMomentTemplate: StoryboardTemplate = {
  id: 'characterMoment',
  name: 'Character Moment',
  shots: [
    { // Shot 1: Contemplation
      generateText: (inputs) => {
        let stillnessDescription = "is still";
        switch (inputs.userEmotion?.toLowerCase()) {
          case 'sad': stillnessDescription = "is quiet and withdrawn, a profound sadness in their stillness"; break;
          case 'angry': stillnessDescription = "is rigid with barely suppressed anger, their stillness heavy"; break;
          case 'happy': stillnessDescription = "emanates a quiet joy, their stillness peaceful"; break;
          case 'excited': stillnessDescription = "is thrumming with anticipation, their stillness a coiled spring"; break;
          case 'mysterious': stillnessDescription = "is enveloped in an intriguing stillness, thoughts hidden"; break;
          case 'calm': stillnessDescription = "is serene and composed, their stillness a calm pool"; break;
        }
        return `The character, ${inputs.characterDescription || 'a thoughtful individual'}, ${stillnessDescription}, their expression deeply ${inputs.userEmotion || 'reflective and pensive'}. They are in ${inputs.themeDetails?.setting || 'a quiet, contemplative space'} that enhances the mood.`;
      },
      cameraPath: "Tight close-up on the character's face, capturing subtle nuances of their expression. Very slow, almost imperceptible focus pull.",
      sfxText: () => null,
    },
    { // Shot 2: Internal Thought/Realization
      generateText: (inputs) => {
        let internalMonologuePrefix = "A profound thought takes shape.";
        if (inputs.userInternalMonologue) {
          switch (inputs.userEmotion?.toLowerCase()) {
            case 'angry': internalMonologuePrefix = `Their thoughts rage: \"${inputs.userInternalMonologue}\"`; break;
            case 'sad': internalMonologuePrefix = `A sorrowful echo in their mind: \"${inputs.userInternalMonologue}\"`; break;
            case 'happy': internalMonologuePrefix = `A joyful realization dawns: \"${inputs.userInternalMonologue}\"`; break;
            case 'excited': internalMonologuePrefix = `An exciting idea flashes: \"${inputs.userInternalMonologue}\"`; break;
            default: internalMonologuePrefix = `Their inner voice whispers: \"${inputs.userInternalMonologue}\"`;
          }
        }
        return `A flicker of understanding crosses their eyes, a subtle shift indicating an internal realization. ${internalMonologuePrefix}`;
      },
      cameraPath: "Extreme close-up on the eyes, perhaps a brief, soft shimmer or lighting change to emphasize the dawning thought.",
      sfxText: (inputs) => inputs.userThoughtBubbleSfx ? `(Visual thought: ${inputs.userThoughtBubbleSfx})` : null,
    },
    { // Shot 3: Emotional Shift
      generateText: (inputs) => {
        let transformationDesc = "subtly transforms";
        // This could be expanded with more specific resulting emotions if the UI supports them
        switch (inputs.userResultingEmotion?.toLowerCase()) {
            case 'hopeful': transformationDesc = "softens with a glimmer of hope"; break;
            case 'determined': transformationDesc = "hardens with new resolve"; break;
            case 'relieved': transformationDesc = "relaxes as relief washes over them"; break;
            case 'confused': transformationDesc = "knits with sudden confusion"; break;
        }
        return `Their facial expression ${transformationDesc}, a hint of ${inputs.userResultingEmotion || 'a new understanding or emotion'} now visible. The change is subtle yet significant.`;
      },
      cameraPath: "Slow, gentle pull back from extreme close-up to a standard close-up, allowing the emotional shift to register clearly.",
      sfxText: () => null,
    },
    { // Shot 4: Lingering on the Moment
      generateText: (inputs) => {
        let feeling = "the weight or lightness of the moment";
        if (inputs.userResultingEmotion) {
            // Simple examples, could be more nuanced
            if (['happy', 'relieved', 'hopeful'].includes(inputs.userResultingEmotion.toLowerCase())) feeling = "the uplifting lightness of the moment";
            else if (['sad', 'angry', 'confused'].includes(inputs.userResultingEmotion.toLowerCase())) feeling = "the heavy weight of the moment";
        }
        return `The camera holds as they absorb this internal shift, ${feeling} palpable in their stillness.`;
      },
      cameraPath: "Static close-up or medium close-up, allowing the emotion to fully resonate with the viewer. No sudden movements.",
      sfxText: () => null,
    },
    { // Shot 5: Subtle Change/Resolve
      generateText: (inputs) => {
        let finalState = "A newfound resolve, a quiet acceptance, or a gentle smile settles upon their features.";
        if (inputs.userResultingEmotion) {
            switch (inputs.userResultingEmotion.toLowerCase()) {
                case 'determined': finalState = "A steely glint of determination now shines in their eyes."; break;
                case 'hopeful': finalState = "A gentle, hopeful smile touches their lips."; break;
                case 'relieved': finalState = "Visible relief smooths their features, a sense of peace settling in."; break;
                case 'calm': finalState = "A profound sense of calm acceptance settles over them."; break;
            }
        }
        return `${finalState} The scene softens around them, indicating a sense of closure or a new beginning.`;
      },
      cameraPath: "Very gentle focus shift, perhaps a slight, artistic blur to the background, with a slow, soft fade out.",
      sfxText: () => null,
    },
  ],
  adaptForDuration: (shotTexts, durationSeconds) => {
    if (durationSeconds > 8) { // For 10-second animations
      if (shotTexts[0]) shotTexts[0] += " The world around them seems to fade, emphasizing their inner state.";
      if (shotTexts[1]) shotTexts[1] += " The realization washes over them, clear and undeniable.";
      if (shotTexts[2]) shotTexts[2] += " This change emanates from deep within, altering their perspective.";
      if (shotTexts[3]) shotTexts[3] += " Time seems to pause, allowing the full weight of the emotion to be felt.";
      if (shotTexts[4]) shotTexts[4] += " They are subtly changed, ready to move forward with this new insight.";
    }
    return shotTexts;
  }
};

const storyboardTemplates: Record<string, StoryboardTemplate> = {
  simpleActionReveal: simpleActionRevealTemplate,
  characterMoment: characterMomentTemplate,
  // Add more templates here
};

interface ThemeSpecificDetails {
  setting?: string;
  revealElement?: string;
  revealedElementName?: string;
  visualStyleDescription?: string; // Added for theme-specific visual cues
}

export interface AnimationInputData { // Exporting for use in other parts of the application if needed
  characterDescription?: string;
  theme: string;
  userAction: string;
  userEmotion: string;
  userSfx?: string;
  durationSeconds: number;
  userInternalMonologue?: string;
  userThoughtBubbleSfx?: string;
  userResultingEmotion?: string;
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
      populatedThemeDetails = {
        setting: "In a bustling downtown area,",
        revealElement: "a hidden alleyway entrance",
        revealedElementName: "alleyway",
        visualStyleDescription: "The scene is depicted in a bright, vibrant classic comic book style with bold lines and a mix of warm and cool primary colors under a clear blue sky."
      };
      break;
    case 'fantasy':
      populatedThemeDetails = {
        setting: "In an ancient, mystical forest,",
        revealElement: "a glowing, ancient rune stone",
        revealedElementName: "rune stone",
        visualStyleDescription: "The scene unfolds in a detailed, mystical comic style, rich with lush greens, earthy browns, and an atmosphere of ancient magic."
      };
      break;
    case 'neon':
      populatedThemeDetails = {
        setting: "On a rain-slicked cyberpunk street,",
        revealElement: "a flickering, secret data port",
        revealedElementName: "data port",
        visualStyleDescription: "The scene is drenched in a dark, atmospheric cyberpunk comic style, highlighted by glowing neon lights in pinks, blues, and yellows, with strong contrasts and reflections."
      };
      break;
    default:
      console.warn(`No specific theme details for theme: ${inputs.theme}. Using generic descriptions.`);
      populatedThemeDetails = {
        setting: "In a fitting environment,",
        revealElement: "something unexpected",
        revealedElementName: "revelation",
        visualStyleDescription: "The scene is rendered in a general comic book style."
      };
  }

  const fullInputs = { ...inputs, themeDetails: populatedThemeDetails };

  let shotTexts = currentTemplate.shots.map(shot => {
    let text = shot.generateText(fullInputs);
    if (shot.cameraPath) {
      text = `(${shot.cameraPath}) ${text}`;
    }
    // Prepend the visual style description to each shot's narrative text
    if (fullInputs.themeDetails?.visualStyleDescription) {
      text = `${fullInputs.themeDetails.visualStyleDescription} ${text}`;
    }
    if (shot.sfxText) {
      const sfx = shot.sfxText(fullInputs);
      if (sfx) {
        text += ` SFX: ${sfx}`; 
      }
    }
    return text;
  });

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