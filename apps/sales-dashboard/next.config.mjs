/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 14.x syntax: externalise native-addon packages from the RSC bundler.
  // (The Next 15 `serverExternalPackages` top-level key is silently ignored on 14.)
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
  webpack: (config) => {
    config.externals.push({
      'better-sqlite3': 'commonjs better-sqlite3',
    });
    return config;
  },
};

export default nextConfig;
