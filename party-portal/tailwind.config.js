/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // More specific paths to ensure everything is captured
    "./apps/frontend/shell/src/**/*.{js,jsx,ts,tsx,html}",
    "./apps/frontend/shell/src/app/**/*.{js,jsx,ts,tsx,html}",
    "./apps/frontend/shell/src/modules/**/*.{js,jsx,ts,tsx,html}",
    "./apps/frontend/shell/src/components/**/*.{js,jsx,ts,tsx,html}",
    // Also scan other apps if they may be loaded as modules
    "./apps/frontend/auth/src/**/*.{js,jsx,ts,tsx,html}",
    "./apps/frontend/chat/src/**/*.{js,jsx,ts,tsx,html}", 
    "./apps/frontend/cinema/src/**/*.{js,jsx,ts,tsx,html}",
    // Shared libraries
    "./libs/frontend/**/*.{js,jsx,ts,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        'test-red': '#FF0000', // Add a test color to verify config is working
      },
    },
  },
  plugins: [],
};