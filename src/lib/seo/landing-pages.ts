export type LandingFaq = { q: string; a: string };

export type LandingPage = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  bullets: string[];
  faqs: LandingFaq[];
  keywords?: string[];
};

export const landingPages: LandingPage[] = [
  {
    slug: "coding-tutorial-to-shorts",
    title: "Coding Tutorial to Shorts",
    description: "Turn long coding tutorials into punchy split-screen shorts with captions in minutes.",
    h1: "Convert Coding Tutorials Into Shorts Fast",
    intro:
      "macet.ai helps coding creators cut one long tutorial into vertical clips with webcam + screen layouts and readable captions.",
    bullets: [
      "Detect high-value teaching moments from transcript",
      "Keep webcam context while showing code on screen",
      "Export clips with title, hook, and hashtag suggestions"
    ],
    faqs: [
      {
        q: "Can I keep both facecam and code visible in one short?",
        a: "Yes. macet.ai uses a split-screen layout so the webcam and screen recording appear together in a vertical frame."
      },
      {
        q: "Do I need manual editing software?",
        a: "No. You upload one tutorial video, adjust crop if needed, and export ready-to-post clips."
      }
    ],
    keywords: ["coding tutorial to shorts", "code video repurposing", "developer shorts tool"]
  },
  {
    slug: "screen-recording-to-vertical-video",
    title: "Screen Recording to Vertical Video",
    description: "Repurpose horizontal screen recordings into 9:16 split-screen clips for short-form platforms.",
    h1: "Turn Screen Recordings Into Vertical Videos",
    intro:
      "Use one screen recording and quickly output vertical clips designed for TikTok, Reels, Shorts, and X videos.",
    bullets: [
      "Automatic 9:16 framing with split-screen template",
      "Caption presets for readability on mobile",
      "Export multiple clips from one source recording"
    ],
    faqs: [
      {
        q: "Will my screen content still be readable on mobile?",
        a: "Yes. The output is optimized for vertical viewing and includes burn-in captions to retain context."
      },
      {
        q: "Can I choose what clip sections to export?",
        a: "You get AI suggestions and can manually decide which clips to keep for export."
      }
    ],
    keywords: ["screen recording to vertical video", "9:16 tutorial clips"]
  },
  {
    slug: "obs-to-tiktok-shorts",
    title: "OBS to TikTok Shorts",
    description: "Use your OBS recordings to generate TikTok-ready split-screen tutorial clips with metadata packs.",
    h1: "From OBS Recording to TikTok Shorts",
    intro: "Upload your OBS file once, then export short clips with hook-first copy and mobile-friendly captions.",
    bullets: [
      "Works with webcam + desktop capture recordings",
      "Generate TikTok caption ideas from clip context",
      "Keep posting cadence without heavy editing"
    ],
    faqs: [
      {
        q: "Do you publish directly to TikTok?",
        a: "In MVP, macet.ai provides a publish pack for manual posting and opens platform upload pages."
      },
      {
        q: "Can I reuse one OBS file for multiple clips?",
        a: "Yes. A single source file can produce several short clips."
      }
    ],
    keywords: ["obs to tiktok shorts", "obs recording repurpose"]
  },
  {
    slug: "webcam-overlay-to-split-screen",
    title: "Webcam Overlay to Split Screen",
    description: "Transform webcam-overlay tutorials into clean split-screen shorts with manual crop control.",
    h1: "Convert Webcam Overlay Videos to Split-Screen Shorts",
    intro: "If your tutorials already include webcam overlay, macet.ai helps you crop and place it for vertical output.",
    bullets: [
      "Manual webcam crop values for precise framing",
      "Top webcam / bottom screen layout",
      "Consistent style across all clips"
    ],
    faqs: [
      {
        q: "Can I adjust webcam position before export?",
        a: "Yes. You can save crop coordinates so the webcam area stays focused in each clip."
      },
      {
        q: "Is there more than one caption style?",
        a: "Yes. MVP includes preset caption styles you can pick per job."
      }
    ],
    keywords: ["webcam overlay to split screen", "tutorial webcam crop"]
  },
  {
    slug: "youtube-tutorial-to-reels",
    title: "YouTube Tutorial to Reels",
    description: "Repurpose YouTube tutorial recordings into Instagram Reels-ready vertical snippets.",
    h1: "Turn YouTube Tutorials Into Reels",
    intro: "Use your long-form tutorial archive to create frequent Reels without rewriting your whole workflow.",
    bullets: [
      "Clip suggestions focused on hooks and outcomes",
      "Export metadata pack for manual Reels posting",
      "Keep brand voice with editable descriptions"
    ],
    faqs: [
      {
        q: "Does this work for existing YouTube videos?",
        a: "Yes. If you have the source file, you can upload it and generate short clips."
      },
      {
        q: "Do I get captioned exports?",
        a: "Yes. Captions are burned into each exported clip."
      }
    ],
    keywords: ["youtube tutorial to reels", "youtube to instagram reels tool"]
  },
  {
    slug: "react-tutorial-to-shorts",
    title: "React Tutorial to Shorts",
    description: "Generate React tutorial shorts with split-screen context and short-form metadata suggestions.",
    h1: "Create React Tutorial Shorts Quickly",
    intro: "Break down React lessons into short clips that start with a hook and end with a clear takeaway.",
    bullets: [
      "Spot practical React moments for short clips",
      "Keep code + facecam context in one frame",
      "Reuse one tutorial for multi-platform posting"
    ],
    faqs: [
      {
        q: "Can this help me post React tips daily?",
        a: "Yes. macet.ai is designed to produce multiple postable clips from one longer tutorial."
      },
      {
        q: "Are hashtags included in output?",
        a: "Yes. Each clip includes suggested hashtags as part of the publish pack."
      }
    ],
    keywords: ["react tutorial to shorts", "react shorts generator"]
  },
  {
    slug: "nextjs-tutorial-to-shorts",
    title: "Next.js Tutorial to Shorts",
    description: "Convert Next.js tutorials into short-form clips optimized for social discovery.",
    h1: "Repurpose Next.js Tutorials Into Social Shorts",
    intro: "Publish more frequently from your Next.js recordings with a repeatable split-screen short workflow.",
    bullets: [
      "Create clips around routing, data fetching, and deployment tips",
      "Generate platform-ready title and description drafts",
      "Keep production process lightweight"
    ],
    faqs: [
      {
        q: "Is this useful for framework-specific tutorials?",
        a: "Yes. It works well for technical walkthroughs where context from both webcam and screen matters."
      },
      {
        q: "Can I customize clip selection?",
        a: "You receive AI suggestions and can choose which clips to export."
      }
    ],
    keywords: ["nextjs tutorial to shorts", "next.js content repurposing"]
  },
  {
    slug: "saas-demo-to-tiktok",
    title: "SaaS Demo to TikTok",
    description: "Turn SaaS demos into short TikTok clips with strong hooks and clear product moments.",
    h1: "Convert SaaS Demos Into TikTok Clips",
    intro: "Create short demo clips from one product walkthrough and keep your social channels active.",
    bullets: [
      "Extract feature highlight moments",
      "Add clear caption context for silent viewers",
      "Export with ready-to-copy posting text"
    ],
    faqs: [
      {
        q: "Can I use this for product launch content?",
        a: "Yes. Many teams use one demo recording to produce several launch-week clips."
      },
      {
        q: "Do you support direct publishing?",
        a: "MVP focuses on manual publish packs and upload shortcuts."
      }
    ],
    keywords: ["saas demo to tiktok", "product demo shorts"]
  },
  {
    slug: "loom-recording-to-shorts",
    title: "Loom Recording to Shorts",
    description: "Repurpose Loom walkthrough recordings into vertical educational shorts.",
    h1: "Turn Loom Recordings Into Shorts",
    intro: "Take internal or public Loom-style walkthroughs and reformat them into social-friendly clips.",
    bullets: [
      "Use one source file for multiple short snippets",
      "Keep narration context with subtitles",
      "Manual crop controls for webcam region"
    ],
    faqs: [
      {
        q: "Does this support narrated walkthrough videos?",
        a: "Yes. Audio is preserved and captions are rendered into the export."
      },
      {
        q: "Can I make clips for multiple platforms at once?",
        a: "Yes. Export once and use the publish pack for YouTube, TikTok, Instagram, and X."
      }
    ],
    keywords: ["loom recording to shorts", "loom to tiktok"]
  },
  {
    slug: "zoom-recording-to-shorts",
    title: "Zoom Recording to Shorts",
    description: "Convert Zoom class or tutorial recordings into bite-size vertical clips.",
    h1: "From Zoom Recording to Educational Shorts",
    intro: "Educators and trainers can split long Zoom sessions into short lesson clips for social platforms.",
    bullets: [
      "Extract key teaching moments",
      "Add subtitle context to each clip",
      "Reuse existing recordings instead of re-recording"
    ],
    faqs: [
      {
        q: "Can educators use this for course marketing?",
        a: "Yes. It is useful for turning classes into short teaser lessons."
      },
      {
        q: "How many clips can one video produce?",
        a: "It depends on content length, but typically several clips can be generated from one long recording."
      }
    ],
    keywords: ["zoom recording to shorts", "class recording repurpose"]
  },
  {
    slug: "programming-shorts-generator",
    title: "Programming Shorts Generator",
    description: "Generate programming shorts from long coding sessions with split-screen and captioned output.",
    h1: "Programming Shorts Generator for Creators",
    intro: "Build a repeatable short-form workflow for coding education and creator growth.",
    bullets: [
      "AI-assisted clip ideas from transcript context",
      "Vertical exports designed for social feeds",
      "Metadata suggestions for faster publishing"
    ],
    faqs: [
      {
        q: "Is this only for expert programmers?",
        a: "No. It works for beginner tutorials, intermediate guides, and advanced coding walkthroughs."
      },
      {
        q: "What makes this different from normal editors?",
        a: "It is focused on tutorial repurposing, split-screen layout, and publish-ready output rather than manual timeline editing."
      }
    ],
    keywords: ["programming shorts generator", "coding shorts tool"]
  },
  {
    slug: "tutorial-repurposing-tool",
    title: "Tutorial Repurposing Tool",
    description: "Repurpose tutorial videos into short-form assets with less editing overhead.",
    h1: "Tutorial Repurposing Tool for Consistent Posting",
    intro: "macet.ai helps creators post more by converting one tutorial into many short, captioned clips.",
    bullets: [
      "Reduce time from recording to publish",
      "Get clip, title, description, and hashtag suggestions",
      "Keep output aligned with platform formats"
    ],
    faqs: [
      {
        q: "Who is this tool built for?",
        a: "It is built for tutorial creators, dev educators, and low-end creators needing a lightweight workflow."
      },
      {
        q: "Can I add my own final edits after export?",
        a: "Yes. You can download MP4 exports and continue editing elsewhere if needed."
      }
    ],
    keywords: ["tutorial repurposing tool", "tutorial video clip generator"]
  }
];

export function getLandingPageBySlug(slug: string) {
  return landingPages.find((item) => item.slug === slug);
}
