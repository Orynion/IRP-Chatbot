export interface MemoryMessage {
  id: number;
  channel_id: string;
  author_id: string;
  author_name: string;
  is_bot: boolean;
  content: string;
  created_at: string;
  tag: string;
}

export interface SimulationResult {
  triggered: boolean;
  cooldownSuppressed?: boolean;
  reason?: string;
  cooldownRemaining?: number;
  userMessage: MemoryMessage;
  botMessage?: MemoryMessage;
  provider?: string;
  model?: string;
  toolUsed?: {
    tool: string;
    query: string;
    success?: boolean;
  } | null;
  fallbackChain?: string[];
  memoryCount: number;
}

export interface ConfigSummary {
  discordTokenSet: boolean;
  groqKeySet: boolean;
  geminiKeySet: boolean;
  openrouterKeySet: boolean;
  tavilyKeySet: boolean;
  tursoConfigured: boolean;
  cooldownSeconds: number;
  maxHistory: number;
}
