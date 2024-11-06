/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove the rewrites temporarily to rule out routing issues
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/:path*',
  //       destination: 'http://localhost:3001/api/:path*',
  //     },
  //   ];
  // },
};

export default nextConfig;
