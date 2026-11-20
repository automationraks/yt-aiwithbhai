export type AINewsSource = {
  id: string;
  name: string;
  category: "Frontier models" | "AI hardware" | "Cloud AI" | "Open source" | "Research" | "Developer tools";
  feedUrl: string;
  homepage: string;
  priority: "core" | "community";
};

export const AI_NEWS_SOURCES: AINewsSource[] = [
  { id: "openai", name: "OpenAI", category: "Frontier models", feedUrl: "https://openai.com/news/rss.xml", homepage: "https://openai.com/news/", priority: "core" },
  { id: "anthropic", name: "Anthropic", category: "Frontier models", feedUrl: "https://www.anthropic.com/news/rss.xml", homepage: "https://www.anthropic.com/news", priority: "core" },
  { id: "google-deepmind", name: "Google DeepMind", category: "Frontier models", feedUrl: "https://deepmind.google/blog/rss.xml", homepage: "https://deepmind.google/discover/blog/", priority: "core" },
  { id: "google-ai", name: "Google AI", category: "Frontier models", feedUrl: "https://blog.google/technology/ai/rss/", homepage: "https://blog.google/technology/ai/", priority: "core" },
  { id: "meta-ai", name: "Meta AI", category: "Frontier models", feedUrl: "https://about.fb.com/news/category/technology/feed/", homepage: "https://ai.meta.com/blog/", priority: "core" },
  { id: "nvidia", name: "NVIDIA", category: "AI hardware", feedUrl: "https://blogs.nvidia.com/feed/", homepage: "https://blogs.nvidia.com/", priority: "core" },
  { id: "groq", name: "Groq", category: "AI hardware", feedUrl: "https://groq.com/blog/feed/", homepage: "https://groq.com/blog/", priority: "core" },
  { id: "amd", name: "AMD", category: "AI hardware", feedUrl: "https://community.amd.com/t5/ai/bg-p/amd-ai-blog", homepage: "https://www.amd.com/en/developer/resources/technical-articles.html", priority: "community" },
  { id: "microsoft-ai", name: "Microsoft AI", category: "Cloud AI", feedUrl: "https://blogs.microsoft.com/ai/feed/", homepage: "https://blogs.microsoft.com/ai/", priority: "core" },
  { id: "aws-ml", name: "AWS Machine Learning", category: "Cloud AI", feedUrl: "https://aws.amazon.com/blogs/machine-learning/feed/", homepage: "https://aws.amazon.com/blogs/machine-learning/", priority: "core" },
  { id: "huggingface", name: "Hugging Face", category: "Open source", feedUrl: "https://huggingface.co/blog/feed.xml", homepage: "https://huggingface.co/blog", priority: "core" },
  { id: "mistral", name: "Mistral AI", category: "Open source", feedUrl: "https://mistral.ai/news/rss.xml", homepage: "https://mistral.ai/news/", priority: "core" },
  { id: "deepseek", name: "DeepSeek", category: "Open source", feedUrl: "https://github.com/deepseek-ai/DeepSeek-V3/releases.atom", homepage: "https://github.com/deepseek-ai", priority: "core" },
  { id: "qwen", name: "Qwen", category: "Open source", feedUrl: "https://github.com/QwenLM/Qwen3/releases.atom", homepage: "https://github.com/QwenLM", priority: "core" },
  { id: "llama", name: "Llama", category: "Open source", feedUrl: "https://github.com/meta-llama/llama-models/releases.atom", homepage: "https://github.com/meta-llama", priority: "core" },
  { id: "vllm", name: "vLLM", category: "Developer tools", feedUrl: "https://github.com/vllm-project/vllm/releases.atom", homepage: "https://github.com/vllm-project/vllm", priority: "core" },
  { id: "ollama", name: "Ollama", category: "Developer tools", feedUrl: "https://github.com/ollama/ollama/releases.atom", homepage: "https://github.com/ollama/ollama", priority: "community" },
  { id: "langchain", name: "LangChain", category: "Developer tools", feedUrl: "https://blog.langchain.com/rss/", homepage: "https://blog.langchain.com/", priority: "community" },
  { id: "arxiv", name: "arXiv · AI & ML", category: "Research", feedUrl: "https://export.arxiv.org/api/query?search_query=(cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL)&sortBy=submittedDate&sortOrder=descending&max_results=30", homepage: "https://arxiv.org/list/cs.AI/recent", priority: "core" },
];

export const AI_NEWS_CATEGORIES = ["All", "Frontier models", "AI hardware", "Cloud AI", "Open source", "Developer tools", "Research"] as const;
