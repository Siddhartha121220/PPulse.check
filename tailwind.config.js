/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    presets: [require('nativewind/preset')],
    theme: {
        extend: {
            colors: {
                // v2 palette — see REQUIREMENTS.md §4.1
                background: '#0B1A16', // Deep teal-black app background
                surface: '#F3EEE3', // Warm cream — primary card background
                surfaceDark: '#15191B', // Near-black inset panel within a cream card
                accent: '#C7BDF5', // Soft lavender — badges, progress, highlights
                textOnSurface: '#17181A', // Text on cream cards
                textOnDark: '#F5F3EF', // Text on dark backgrounds/panels
                danger: '#E8674F', // Stop/error actions
                muted: '#8A8578', // Muted text on cream surfaces
            }
        },
    },
    plugins: [],
}
