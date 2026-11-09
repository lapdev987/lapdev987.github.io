/**
 * All portfolio copy lives here. These are explicitly placeholder entries,
 * not claims about the owner's background. Add your résumé, then set
 * isTemplate to false. URLs are optional and must use https:// or mailto:.
 */
export const profile = {
  name: "Your name",
  headline: "Your role · Your location · Your next chapter",
  isTemplate: true
};

export interface ResumeCard {
  title: string;
  meta?: string;
  description: string;
  tags?: string[];
  url?: string;
  linkLabel?: string;
}

export interface ResumeSection {
  name: string;
  subtitle: string;
  intro: string;
  cards: ResumeCard[];
  color: string;
  t: number;
}

export const sections: ResumeSection[] = [
  {
    name: "About",
    subtitle: "MEET THE DRIVER",
    intro: "Every good journey starts with an introduction.",
    color: "#7c9566",
    t: 0.10,
    cards: [
      { title: "Hello, I’m Your name.", description: "Add a short introduction here: what you do, what you care about, and the kind of problems you love solving." },
      { title: "What drives me", description: "Share your approach to building things, your interests, and what you’re looking for next.", tags: ["Your specialty", "Your interests", "Your focus"] }
    ]
  },
  {
    name: "Experience",
    subtitle: "MILES THAT MATTER",
    intro: "The people, challenges, and places that shaped my work.",
    color: "#cf8760",
    t: 0.265,
    cards: [
      { title: "Your most recent role", meta: "Company name · Start date — End date", description: "Describe your responsibilities and your strongest achievement. Add a real result or impact metric from your résumé.", tags: ["Your team", "Your stack"] },
      { title: "Your previous role", meta: "Company name · Start date — End date", description: "Tell the story of a problem you solved, what you contributed, and what changed because of your work." }
    ]
  },
  {
    name: "Projects",
    subtitle: "BUILT ALONG THE WAY",
    intro: "Ideas that made it out of the notebook and into the world.",
    color: "#7d8eb3",
    t: 0.43,
    cards: [
      { title: "Your featured project", meta: "Project type · Year", description: "Explain what you built, who it helps, and your role in making it happen. Add a live demo or repository URL to this entry.", tags: ["Technology", "Technology"] },
      { title: "Another thing you’re proud of", meta: "Project type · Year", description: "Include the challenge, your solution, and what you learned. Screenshots and real outcomes make this story stronger.", tags: ["Technology", "Technology"] }
    ]
  },
  {
    name: "Skills",
    subtitle: "TOOLS IN THE TRUNK",
    intro: "A toolkit for turning good questions into useful things.",
    color: "#b89a55",
    t: 0.59,
    cards: [
      { title: "What I build with", description: "Replace these tags with the languages, frameworks, and tools you actually use.", tags: ["Your language", "Your framework", "Your tools"] },
      { title: "How I work", description: "Add the strengths you bring to a team: systems thinking, thoughtful interfaces, collaboration, or something entirely your own." }
    ]
  },
  {
    name: "Education",
    subtitle: "WHERE IT STARTED",
    intro: "Learning is a road with no finish line.",
    color: "#a087a8",
    t: 0.75,
    cards: [
      { title: "Your degree or qualification", meta: "Institution name · Year", description: "Include your field of study and relevant coursework, awards, or activities." },
      { title: "Always learning", description: "Add certifications, courses, or self-directed learning that have shaped your work." }
    ]
  },
  {
    name: "Contact",
    subtitle: "THE NEXT CHAPTER",
    intro: "Have a good idea? Let’s see where it takes us.",
    color: "#6a9b91",
    t: 0.91,
    cards: [
      { title: "Let’s make something happen.", description: "Add your preferred email address as a mailto: URL here so visitors can get in touch.", tags: ["Your location", "Your availability"] },
      { title: "Find me around the internet", description: "Add separate entries with your GitHub, LinkedIn, or personal website URLs. Only links you provide will appear." }
    ]
  }
];
