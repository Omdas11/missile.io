/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export: the game is 100% client-side, so Vercel serves
  // plain static files with no Node server needed.
  output: 'export',
};

export default nextConfig;
