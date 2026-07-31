import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // devstudio and the repo root both have a package-lock.json, so Next guesses the
  // parent as the workspace root and warns on every start. This app's root is here.
  outputFileTracingRoot: path.dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
