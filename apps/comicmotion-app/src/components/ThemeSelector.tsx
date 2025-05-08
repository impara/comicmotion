'use client';

import React, { useState } from 'react';
import Image from 'next/image'; // Import Next.js Image component

interface Theme {
  id: string;
  name: string;
  // thumbnailPlaceholder: string; // Replace placeholder with actual src
  thumbnailSrc: string; // Path relative to /public directory
  description: string; 
}

const THEMES: Theme[] = [
  {
    id: 'city',
    name: 'Cityscape',
    // thumbnailPlaceholder: 'bg-blue-400',
    thumbnailSrc: '/images/themes/city.jpg', // Assumed path
    description: 'A bustling metropolis environment.'
  },
  {
    id: 'fantasy',
    name: 'Fantasy Realm',
    // thumbnailPlaceholder: 'bg-green-400',
    thumbnailSrc: '/images/themes/fantasy.jpg', // Assumed path
    description: 'An epic landscape with castles and magic.'
  },
  {
    id: 'neon',
    name: 'Neon Nights',
    // thumbnailPlaceholder: 'bg-purple-400',
    thumbnailSrc: '/images/themes/neon.jpg', // Assumed path
    description: 'A futuristic cyberpunk street scene.'
  }
];

interface ThemeSelectorProps {
  onSubmitSelections: (selections: { themeId: string; action: string; emotion: string; sfx: string }) => void;
}

export function ThemeSelector({ onSubmitSelections }: ThemeSelectorProps) {
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [emotion, setEmotion] = useState('');
  const [sfx, setSfx] = useState('');

  const handleThemeSelect = (themeId: string) => {
    setSelectedTheme(themeId);
  };

  const handleSubmit = () => {
    if (selectedTheme) {
      onSubmitSelections({
        themeId: selectedTheme,
        action,
        emotion,
        sfx,
      });
    }
  };

  // Define some sample options for dropdowns - these can be expanded
  const emotionOptions = ['Happy', 'Sad', 'Angry', 'Excited', 'Mysterious', 'Calm'];
  const sfxOptions = ['None', 'Whoosh', 'Bang', 'Clang', 'Zap', 'Boing'];

  return (
    <div className="w-full max-w-5xl mx-auto px-2 sm:px-4 py-8">
      <h2 className="text-2xl sm:text-3xl font-semibold text-center mb-6 sm:mb-8">Step 2: Choose Your Scene Theme & Narrative Beats</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        {THEMES.map((theme) => (
          <div
            key={theme.id}
            onClick={() => handleThemeSelect(theme.id)}
            className={`
              group border rounded-lg p-3 sm:p-4 cursor-pointer transition-all duration-300 
              hover:shadow-xl hover:scale-[1.03] hover:border-blue-400 
              ${selectedTheme === theme.id 
                ? 'border-blue-600 border-2 ring-2 ring-blue-300 ring-offset-1 shadow-lg scale-[1.02]'
                : 'border-gray-300'}
            `}
          >
            <div className="relative w-full h-48 sm:h-56 rounded-md mb-3 overflow-hidden">
              <Image 
                src={theme.thumbnailSrc}
                alt={`${theme.name} Theme Thumbnail`}
                layout="fill"
                objectFit="cover"
                className="transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <h3 className="text-lg font-semibold mb-1 text-center">{theme.name}</h3>
            <p className="text-sm text-gray-600 text-center px-1">{theme.description}</p>
          </div>
        ))}
      </div>

      {selectedTheme && (
        <div className="mt-8 pt-6 border-t border-gray-200">
          <h3 className="text-xl font-semibold text-center mb-6">Step 3: Define Narrative Beats</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label htmlFor="action" className="block text-sm font-medium text-gray-700 mb-1">
                Action / Goal
              </label>
              <input
                type="text"
                name="action"
                id="action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="e.g., Exploring ancient ruins"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              />
            </div>
            <div>
              <label htmlFor="emotion" className="block text-sm font-medium text-gray-700 mb-1">
                Emotion / Tone
              </label>
              <select
                name="emotion"
                id="emotion"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              >
                <option value="">Select Emotion...</option>
                {emotionOptions.map(opt => <option key={opt} value={opt.toLowerCase()}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sfx" className="block text-sm font-medium text-gray-700 mb-1">
                SFX / Emphasis (Optional)
              </label>
              <select
                name="sfx"
                id="sfx"
                value={sfx}
                onChange={(e) => setSfx(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2"
              >
                {sfxOptions.map(opt => <option key={opt} value={opt.toLowerCase()}>{opt}</option>)}
              </select>
            </div>
          </div>
          <div className="text-center">
            <button
              onClick={handleSubmit}
              disabled={!selectedTheme || !action || !emotion} // SFX is optional
              className="px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Generate Comic!
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 