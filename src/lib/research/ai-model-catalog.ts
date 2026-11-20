export type AIModelFamily = {
  id: string;
  provider: string;
  models: string[];
  focus: string;
  officialUrl: string;
  geography: string;
  openness: "Open weights / open source" | "Proprietary" | "Mixed";
};

export const AI_MODEL_FAMILIES: AIModelFamily[] = [
  { id: "openai", provider: "OpenAI", models: ["GPT", "o-series", "GPT realtime", "Sora"], focus: "Reasoning, multimodal, coding, voice and video", officialUrl: "https://openai.com/news/", geography: "United States", openness: "Proprietary" },
  { id: "anthropic", provider: "Anthropic", models: ["Claude", "Claude Sonnet", "Claude Opus", "Claude Haiku"], focus: "Reasoning, coding, tool use and enterprise agents", officialUrl: "https://www.anthropic.com/news", geography: "United States", openness: "Proprietary" },
  { id: "google", provider: "Google DeepMind", models: ["Gemini", "Gemma", "Imagen", "Veo"], focus: "Multimodal models, long context, open models and media generation", officialUrl: "https://deepmind.google/discover/blog/", geography: "United States / global", openness: "Mixed" },
  { id: "xai", provider: "xAI", models: ["Grok"], focus: "Reasoning, real-time information and multimodal models", officialUrl: "https://x.ai/news", geography: "United States", openness: "Mixed" },
  { id: "moonshot", provider: "Moonshot AI", models: ["Kimi", "Kimi K2"], focus: "Long context, coding, reasoning and agentic workflows", officialUrl: "https://www.kimi.com/", geography: "China", openness: "Mixed" },
  { id: "deepseek", provider: "DeepSeek", models: ["DeepSeek V-series", "DeepSeek R-series"], focus: "Reasoning, coding, efficient training and open-weight models", officialUrl: "https://github.com/deepseek-ai", geography: "China", openness: "Open weights / open source" },
  { id: "qwen", provider: "Alibaba · Qwen", models: ["Qwen", "Qwen Coder", "Qwen VL"], focus: "Multilingual, coding, vision and open-weight model families", officialUrl: "https://qwenlm.github.io/", geography: "China", openness: "Open weights / open source" },
  { id: "zai", provider: "Z.ai", models: ["GLM", "GLM-4"], focus: "Reasoning, coding and agentic models", officialUrl: "https://z.ai/", geography: "China", openness: "Mixed" },
  { id: "minimax", provider: "MiniMax", models: ["MiniMax", "MiniMax M"], focus: "Multimodal, text, audio and agent models", officialUrl: "https://www.minimax.io/", geography: "China", openness: "Mixed" },
  { id: "meta", provider: "Meta", models: ["Llama", "Code Llama"], focus: "Open-weight language models and ecosystem tooling", officialUrl: "https://ai.meta.com/", geography: "United States", openness: "Open weights / open source" },
  { id: "mistral", provider: "Mistral AI", models: ["Mistral", "Mixtral", "Codestral", "Devstral"], focus: "Efficient, enterprise, coding and open-weight models", officialUrl: "https://mistral.ai/news/", geography: "France", openness: "Mixed" },
  { id: "cohere", provider: "Cohere", models: ["Command", "Aya", "Embed", "Rerank"], focus: "Enterprise RAG, retrieval, multilingual and embedding models", officialUrl: "https://cohere.com/blog", geography: "Canada", openness: "Mixed" },
  { id: "ibm", provider: "IBM", models: ["Granite"], focus: "Enterprise, coding and compact open models", officialUrl: "https://github.com/ibm-granite", geography: "United States", openness: "Open weights / open source" },
  { id: "nvidia", provider: "NVIDIA", models: ["Nemotron", "Cosmos", "Nemotron speech"], focus: "Open models, physical AI, inference and accelerated computing", officialUrl: "https://developer.nvidia.com/ai", geography: "United States", openness: "Mixed" },
  { id: "microsoft", provider: "Microsoft", models: ["Phi"], focus: "Small language models, on-device and efficient inference", officialUrl: "https://azure.microsoft.com/en-us/products/phi", geography: "United States", openness: "Open weights / open source" },
  { id: "bytedance", provider: "ByteDance", models: ["Seed", "Seedream", "Seedance"], focus: "Multimodal, image and video generation", officialUrl: "https://seed.bytedance.com/", geography: "China", openness: "Mixed" },
  { id: "baidu", provider: "Baidu", models: ["ERNIE"], focus: "Foundation models and multimodal AI", officialUrl: "https://yiyan.baidu.com/", geography: "China", openness: "Mixed" },
  { id: "tencent", provider: "Tencent", models: ["Hunyuan"], focus: "Multimodal, coding and media generation", officialUrl: "https://hunyuan.tencent.com/", geography: "China", openness: "Mixed" },
];

export const AI_CASE_STUDY_FORMATS = [
  { id: "architecture", title: "Architecture breakdown", question: "How is the system built end to end?", evidence: "Official architecture docs, technical papers, APIs and diagrams" },
  { id: "engineering", title: "Engineering deep dive", question: "How do training, inference, serving, data and orchestration work?", evidence: "Technical reports, benchmarks, code and reproducible experiments" },
  { id: "business", title: "Business and product case study", question: "What problem does it solve, who benefits and what trade-offs exist?", evidence: "Product documentation, customer cases and transparent metrics" },
  { id: "comparison", title: "Model and platform comparison", question: "How do capability, quality, latency, cost, privacy and openness compare?", evidence: "Comparable benchmarks, pricing pages and controlled tests" },
  { id: "open-source", title: "Open-source implementation", question: "Can developers reproduce or self-host the approach?", evidence: "Repositories, licences, model cards, deployment guides and issues" },
  { id: "failure", title: "Failure analysis", question: "What failed, why did it fail and what should engineers learn?", evidence: "Incident reports, postmortems, security advisories and first-hand technical sources" },
  { id: "research", title: "Research-to-production", question: "What does a new paper change in practical AI engineering?", evidence: "Original paper, author code, follow-up replications and limitations" },
] as const;

export const AIWITHBHAI_EDITORIAL_PILLARS = [
  "AI model launches and capability changes",
  "AI system architecture and design patterns",
  "LLM training, fine-tuning and inference",
  "RAG, memory, retrieval and knowledge systems",
  "AI agents, tools and multi-agent orchestration",
  "AI infrastructure, chips, networking and data centres",
  "Open-source models, licences and self-hosting",
  "Multimodal AI: image, audio, video and robotics",
  "AI safety, security, privacy and governance",
  "AI adoption case studies across industries",
  "Cost, latency, quality and reliability engineering",
  "Research papers translated into engineering practice",
] as const;
