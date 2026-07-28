/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@khove/shared", "@splinetool/react-spline", "@splinetool/runtime"],
  webpack: (config) => {
    config.resolve.conditionNames = ["browser", "import", "module", "default"];
    return config;
  },
};

export default nextConfig;
