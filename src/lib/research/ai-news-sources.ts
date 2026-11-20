export type AINewsSource = {
  id: string;
  name: string;
  category: "Frontier models" | "AI hardware" | "Cloud AI" | "Open source" | "Research" | "Developer tools" | "Model ecosystems";
  feedUrl: string;
  homepage: string;
  priority: "core" | "community";
};

export const AI_NEWS_SOURCES: AINewsSource[] = [
  { id: "openai", name: "OpenAI", category: "Frontier models", feedUrl: "https://openai.com/news/rss.xml", homepage: "https://openai.com/news/", priority: "core" },
  { id: "anthropic", name: "Anthropic", category: "Frontier models", feedUrl: "https://www.anthropic.com/news/rss.xml", homepage: "https://www.anthropic.com/news", priority: "core" },
  { id: "google-deepmind", name: "Google DeepMind", category: "Frontier models", feedUrl: "https://deepmind.google/blog/rss.xml", homepage: "https://deepmind.google/discover/blog/", priority: "core" },
  { id: "google-ai", name: "Google AI · Gemini", category: "Frontier models", feedUrl: "https://blog.google/technology/ai/rss/", homepage: "https://deepmind.google/technologies/gemini/", priority: "core" },
  { id: "meta-ai", name: "Meta AI", category: "Frontier models", feedUrl: "https://about.fb.com/news/category/technology/feed/", homepage: "https://ai.meta.com/blog/", priority: "core" },
  { id: "xai", name: "xAI · Grok", category: "Frontier models", feedUrl: "https://x.ai/news", homepage: "https://x.ai/news", priority: "core" },
  { id: "moonshot-kimi", name: "Moonshot AI · Kimi", category: "Frontier models", feedUrl: "https://www.kimi.com/en/blog/", homepage: "https://www.kimi.com/en/blog/", priority: "core" },
  { id: "zai-glm", name: "Z.ai · GLM", category: "Frontier models", feedUrl: "https://z.ai/blog", homepage: "https://z.ai/blog", priority: "core" },
  { id: "minimax", name: "MiniMax", category: "Frontier models", feedUrl: "https://www.minimax.io/news", homepage: "https://www.minimax.io/news", priority: "core" },
  { id: "cohere", name: "Cohere", category: "Frontier models", feedUrl: "https://cohere.com/blog", homepage: "https://cohere.com/blog", priority: "community" },
  { id: "ai21", name: "AI21 Labs", category: "Frontier models", feedUrl: "https://www.ai21.com/blog/", homepage: "https://www.ai21.com/blog/", priority: "community" },
  { id: "baidu", name: "Baidu · ERNIE", category: "Frontier models", feedUrl: "https://yiyan.baidu.com/", homepage: "https://yiyan.baidu.com/", priority: "community" },
  { id: "bytedance", name: "ByteDance · Seed", category: "Frontier models", feedUrl: "https://seed.bytedance.com/", homepage: "https://seed.bytedance.com/", priority: "core" },
  { id: "tencent", name: "Tencent · Hunyuan", category: "Frontier models", feedUrl: "https://hunyuan.tencent.com/", homepage: "https://hunyuan.tencent.com/", priority: "community" },
  { id: "nvidia", name: "NVIDIA", category: "AI hardware", feedUrl: "https://blogs.nvidia.com/feed/", homepage: "https://blogs.nvidia.com/", priority: "core" },
  { id: "groq", name: "Groq", category: "AI hardware", feedUrl: "https://groq.com/blog/feed/", homepage: "https://groq.com/blog/", priority: "core" },
  { id: "amd", name: "AMD", category: "AI hardware", feedUrl: "https://community.amd.com/t5/ai/bg-p/amd-ai-blog", homepage: "https://www.amd.com/en/developer/resources/technical-articles.html", priority: "community" },
  { id: "intel-ai", name: "Intel AI", category: "AI hardware", feedUrl: "https://www.intel.com/content/www/us/en/newsroom/home.html", homepage: "https://www.intel.com/content/www/us/en/artificial-intelligence/overview.html", priority: "community" },
  { id: "apple-ml", name: "Apple Machine Learning", category: "AI hardware", feedUrl: "https://machinelearning.apple.com/rss.xml", homepage: "https://machinelearning.apple.com/", priority: "community" },
  { id: "microsoft-ai", name: "Microsoft AI", category: "Cloud AI", feedUrl: "https://blogs.microsoft.com/ai/feed/", homepage: "https://blogs.microsoft.com/ai/", priority: "core" },
  { id: "aws-ml", name: "AWS Machine Learning", category: "Cloud AI", feedUrl: "https://aws.amazon.com/blogs/machine-learning/feed/", homepage: "https://aws.amazon.com/blogs/machine-learning/", priority: "core" },
  { id: "azure-ai", name: "Microsoft Azure AI", category: "Cloud AI", feedUrl: "https://azure.microsoft.com/en-us/blog/feed/", homepage: "https://azure.microsoft.com/en-us/blog/", priority: "core" },
  { id: "google-cloud-ai", name: "Google Cloud AI", category: "Cloud AI", feedUrl: "https://cloud.google.com/blog/products/ai-machine-learning/rss", homepage: "https://cloud.google.com/blog/products/ai-machine-learning", priority: "community" },
  { id: "huggingface", name: "Hugging Face", category: "Open source", feedUrl: "https://huggingface.co/blog/feed.xml", homepage: "https://huggingface.co/blog", priority: "core" },
  { id: "mistral", name: "Mistral AI", category: "Open source", feedUrl: "https://mistral.ai/news/rss.xml", homepage: "https://mistral.ai/news/", priority: "core" },
  { id: "qwen-blog", name: "Alibaba · Qwen", category: "Open source", feedUrl: "https://qwenlm.github.io/blog/index.xml", homepage: "https://qwenlm.github.io/blog/", priority: "core" },
  { id: "zai-github", name: "Z.ai · GLM open models", category: "Open source", feedUrl: "https://github.com/zai-org/GLM-4.5/releases.atom", homepage: "https://github.com/zai-org", priority: "community" },
  { id: "moonshot-github", name: "Moonshot · Kimi open projects", category: "Open source", feedUrl: "https://github.com/MoonshotAI/Kimi-K2/releases.atom", homepage: "https://github.com/MoonshotAI", priority: "community" },
  { id: "minimax-github", name: "MiniMax open models", category: "Open source", feedUrl: "https://github.com/MiniMax-AI/MiniMax-01/releases.atom", homepage: "https://github.com/MiniMax-AI", priority: "community" },
  { id: "ai2", name: "Allen Institute for AI", category: "Open source", feedUrl: "https://allenai.org/blog/rss.xml", homepage: "https://allenai.org/blog", priority: "community" },
  { id: "ibm-granite", name: "IBM · Granite", category: "Open source", feedUrl: "https://github.com/ibm-granite/granite-models/releases.atom", homepage: "https://github.com/ibm-granite", priority: "community" },
  { id: "microsoft-phi", name: "Microsoft · Phi", category: "Open source", feedUrl: "https://github.com/microsoft/Phi-3CookBook/releases.atom", homepage: "https://azure.microsoft.com/en-us/products/phi", priority: "community" },
  { id: "nvidia-nemotron", name: "NVIDIA · Nemotron", category: "Open source", feedUrl: "https://github.com/NVIDIA/NeMo/releases.atom", homepage: "https://developer.nvidia.com/nemotron", priority: "community" },
  { id: "deepseek", name: "DeepSeek", category: "Open source", feedUrl: "https://github.com/deepseek-ai/DeepSeek-V3/releases.atom", homepage: "https://github.com/deepseek-ai", priority: "core" },
  { id: "qwen", name: "Qwen", category: "Open source", feedUrl: "https://github.com/QwenLM/Qwen3/releases.atom", homepage: "https://github.com/QwenLM", priority: "core" },
  { id: "llama", name: "Llama", category: "Open source", feedUrl: "https://github.com/meta-llama/llama-models/releases.atom", homepage: "https://github.com/meta-llama", priority: "core" },
  { id: "vllm", name: "vLLM", category: "Developer tools", feedUrl: "https://github.com/vllm-project/vllm/releases.atom", homepage: "https://github.com/vllm-project/vllm", priority: "core" },
  { id: "ollama", name: "Ollama", category: "Developer tools", feedUrl: "https://github.com/ollama/ollama/releases.atom", homepage: "https://github.com/ollama/ollama", priority: "community" },
  { id: "langchain", name: "LangChain", category: "Developer tools", feedUrl: "https://blog.langchain.com/rss/", homepage: "https://blog.langchain.com/", priority: "community" },
  { id: "llamaindex", name: "LlamaIndex", category: "Developer tools", feedUrl: "https://www.llamaindex.ai/blog", homepage: "https://www.llamaindex.ai/blog", priority: "community" },
  { id: "crewai", name: "CrewAI", category: "Developer tools", feedUrl: "https://github.com/crewAIInc/crewAI/releases.atom", homepage: "https://www.crewai.com/", priority: "community" },
  { id: "comfyui", name: "ComfyUI", category: "Developer tools", feedUrl: "https://github.com/comfyanonymous/ComfyUI/releases.atom", homepage: "https://www.comfy.org/", priority: "community" },
  { id: "arxiv", name: "arXiv · AI & ML", category: "Research", feedUrl: "https://rss.arxiv.org/rss/cs.AI", homepage: "https://arxiv.org/list/cs.AI/recent", priority: "core" },
  { id: "arxiv-ml", name: "arXiv · Machine Learning", category: "Research", feedUrl: "https://rss.arxiv.org/rss/cs.LG", homepage: "https://arxiv.org/list/cs.LG/recent", priority: "core" },
  { id: "arxiv-cl", name: "arXiv · NLP", category: "Research", feedUrl: "https://rss.arxiv.org/rss/cs.CL", homepage: "https://arxiv.org/list/cs.CL/recent", priority: "core" },
  { id: "arxiv-robotics", name: "arXiv · Robotics", category: "Research", feedUrl: "https://rss.arxiv.org/rss/cs.RO", homepage: "https://arxiv.org/list/cs.RO/recent", priority: "community" },
];

export const AI_NEWS_CATEGORIES = ["All", "Frontier models", "AI hardware", "Cloud AI", "Open source", "Developer tools", "Research", "Model ecosystems"] as const;
