import type { Config } from "tailwindcss";

import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1200px"
      }
    },
    extend: {
      colors: {
        bg: "hsl(var(--bg))",
        "bg-elevated": "hsl(var(--bg-elevated))",
        fg: "hsl(var(--fg))",
        "fg-muted": "hsl(var(--fg-muted))",
        "border-muted": "hsl(var(--border-muted))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--primary-foreground))"
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--fg))"
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--primary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" }
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" }
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" }
        },
        "scale-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.98)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" }
        },
        "scale-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.98)" }
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-out": "fade-out 160ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "scale-in": "scale-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "scale-out": "scale-out 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "fade-up": "fade-up 520ms cubic-bezier(0.2, 0.8, 0.2, 1)"
      }
    }
  },
  plugins: [tailwindcssAnimate]
};

export default config;
