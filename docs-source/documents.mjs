// The documents to build: the Markdown file in docs/, where the PDF goes, and what the cover and header say.
export const DOCUMENTS = [
  { name: "overview", folder: "01-Project-Overview", file: "Brief-Project-Overview", title: "Project Overview", kind: "Project overview", subtitle: "What Brief is, the problem it solves, who it is for, and how it works", running: "Project Overview" },
  { name: "summary", folder: "01-Project-Overview", file: "Brief-Project-Summary", title: "Project Summary", kind: "Project summary", subtitle: "The problem, the solution, the technology and the verified results, on a few pages", running: "Project Summary" },
  { name: "features", keepTables: true, folder: "01-Project-Overview", file: "Brief-Key-Features", title: "Key Features", kind: "Feature guide", subtitle: "Every important feature: what it does, how it is built, and whether AI is involved", running: "Key Features" },
  { name: "stack", folder: "05-Technology-Stack", file: "Brief-Technology-Stack", title: "Technology Stack", kind: "Technology stack", subtitle: "Every technology in Brief: what it is, why it is used, where, and how", running: "Technology Stack" },
  { name: "architecture", folder: "06-System-Architecture", file: "Brief-System-Architecture", title: "System Architecture", kind: "System architecture", subtitle: "The parts of Brief, where each one runs, and how they talk to each other", running: "System Architecture" },
  { name: "architecture-explained", folder: "06-System-Architecture", file: "Brief-Architecture-Explanation", title: "Architecture Explanation", kind: "Architecture explanation", subtitle: "The journey of a request through Brief, step by step, in plain English", running: "Architecture Explanation" },
  { name: "design", folder: "07-System-Design", file: "Brief-System-Design", title: "System Design", kind: "System design", subtitle: "Requirements, design, data, security, errors, performance, scale and limits", running: "System Design" },
  { name: "cicd", folder: "08-CI-CD", file: "Brief-CI-CD-Explanation", title: "CI/CD Explanation", kind: "CI/CD", subtitle: "How a change becomes the live site, and how it is checked on the way", running: "CI/CD Explanation" },
  { name: "ai", folder: "05-Technology-Stack", file: "Brief-AI-LLM-Documentation", title: "AI and LLM Documentation", kind: "AI and LLM", subtitle: "Where a language model is used in Brief, how, and what is deliberately not left to it", running: "AI and LLM" },
];

// Extra documents that are kept on one computer and not committed (see documents-private.mjs when it exists).
try {
  const { PRIVATE } = await import("./documents-private.mjs");
  DOCUMENTS.push(...PRIVATE);
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
}
