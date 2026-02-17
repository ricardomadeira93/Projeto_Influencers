import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        base: "#fbfaf7",
        ink: "#101112",
        accent: "#f35b04",
        muted: "#5d646d"
      }
    }
  },
  plugins: []
};

export default config;
