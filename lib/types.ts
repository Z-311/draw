export type Stroke = {
  color: string;
  size: number;
  points: { x: number; y: number }[];
};

export type Guess = {
  name: string;
  confidence: string;
  reason: string;
};

export type MessageRole = 'user' | 'assistant' | 'system';

export type Message = {
  id: string;
  role: MessageRole;
  text: string;
  guess?: Guess;
  isError?: boolean;
  canRetry?: boolean;
};

export type ApiError = {
  code: string;
  message: string;
};
