import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fija la raíz a este proyecto (hay otros lockfiles en el árbol del usuario).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
