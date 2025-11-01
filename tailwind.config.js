module.exports = {
darkMode: 'class',
content: [
'./index.html',
'./**/*.html',
'./js/**/*.{js,ts,jsx,tsx}'
],
safelist: [
"hidden","flex","inline-flex","md:flex","grid","items-center","justify-between",
"max-w-7xl","mx-auto","overflow-hidden","overflow-y-auto",
"px-4","py-4","py-12","md:py-16","p-3","p-5","p-6","mt-3","mt-4","mt-6","mt-8","mb-3","mb-4",
"gap-2","gap-3","gap-6","space-x-4","space-y-3","rounded-lg","rounded-xl","rounded-2xl",
"w-9","h-9","h-64",
"grid-cols-2","md:grid-cols-2","md:grid-cols-3","md:grid-cols-5",
"text-xs","text-sm","text-2xl","text-3xl","md:text-5xl",
"border","border-white/10","border-accent/40","bg-accent/20","bg-black/20","backdrop-blur"
],
theme: {
extend: {
colors: {
base: '#0F172A',
accent: '#3B82F6',
success: '#10B981',
warn: '#F59E0B',
danger: '#EF4444'
},
fontFamily: {
sans: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui'],
display: ['Montserrat', 'Manrope', 'ui-sans-serif', 'system-ui'],
mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace']
},
boxShadow: { glass: '0 10px 30px rgba(0,0,0,0.25)' }
}
},
plugins: [
require('@tailwindcss/forms'),
require('@tailwindcss/typography')
]
};