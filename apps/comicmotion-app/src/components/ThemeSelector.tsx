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
  onThemeSelect: (themeId: string) => void;
}

export function ThemeSelector({ onThemeSelect }: ThemeSelectorProps) {
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

  const handleSelect = (themeId: string) => {
    setSelectedTheme(themeId);
    onThemeSelect(themeId);
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <h2 className="text-2xl font-semibold text-center mb-6">Step 2: Choose Your Scene Theme</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {THEMES.map((theme) => (
          <div
            key={theme.id}
            onClick={() => handleSelect(theme.id)}
            className={`
              border rounded-lg p-4 cursor-pointer transition-all duration-200 
              hover:shadow-lg hover:scale-105 
              ${selectedTheme === theme.id ? 'border-blue-600 border-2 ring-2 ring-blue-300' : 'border-gray-300'}
            `}
          >
            {/* Use Next.js Image component */}
            <div className="relative w-full h-40 rounded-md mb-3 overflow-hidden">
              <Image 
                src={theme.thumbnailSrc}
                alt={`${theme.name} Theme Thumbnail`}
                layout="fill" // Fill the container div
                objectFit="cover" // Cover the area, cropping if needed
                className="transition-transform duration-300 group-hover:scale-110" // Example hover effect
              />
            </div>
            {/* <div className={`w-full h-40 rounded-md mb-3 ${theme.thumbnailPlaceholder} flex items-center justify-center text-white font-bold`}>
              {theme.name} (Placeholder)
            </div> */}
            <h3 className="text-lg font-semibold mb-1 text-center">{theme.name}</h3>
            <p className="text-sm text-gray-600 text-center">{theme.description}</p>
          </div>
        ))}
      </div>

      {selectedTheme && (
        <div className="text-center mt-6">
          <p className="text-lg">Selected Theme: <span className="font-semibold">{THEMES.find(t => t.id === selectedTheme)?.name}</span></p>
          {/* Add a 'Next' button or similar here eventually */}
        </div>
      )}
    </div>
  );
} 