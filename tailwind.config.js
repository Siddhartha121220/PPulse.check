/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
    theme: {
        extend: {
            colors: {
                background: '#09090b', // Dark background
                card: '#18181b', // Card background
                primary: '#14b8a6', // Teal 500
                secondary: '#0f766e', // Teal 700
                text: '#f4f4f5', // Zinc 100
                muted: '#71717a', // Zinc 500
            }
        },
    },
    plugins: [],
}
