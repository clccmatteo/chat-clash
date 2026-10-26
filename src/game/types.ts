export type Team = "A" | "B";
export type Language = "en" | "it";
export type Phase =
  | "idle"
  | "battle"
  | "flash"
  | "rush"
  | "verdict"
  | "complete"
  | "stopped";
export type ClashEvent = {
  type: "chat" | "redemption" | "cheer" | "raid";
  team: Team;
  userId: string;
  userName: string;
  text?: string;
  emotes?: string[];
  amount?: number;
  ts: number;
};
export type Challenge = {
  id: string;
  type: "trivia" | "anagram" | "math" | "type-race" | "emote-target";
  prompt: Record<Language, string>;
  answers: string[];
  emote?: string;
};
export type Settings = {
  teams: Record<Team, { name: string; channel: string }>;
  language: Language;
  penalties: string[];
  approved: Record<Team, boolean>;
};
export type Participant = {
  userName: string;
  points: number;
  firstAt: number;
  lastChatAt: number | null;
  redemptions: number;
  bits: number;
  bitsPoints: number;
};
export type ChallengeProgress = {
  answers: Record<Team, Record<string, number>>;
  emotes: Record<Team, Record<string, number>>;
  finished: Record<Team, number | null>;
  firstCorrect: Team | null;
  firstFinisher: Team | null;
  winner: Team | null;
  judged: boolean;
};
export type GameState = {
  settings: Settings;
  phase: Phase;
  startedAt: number | null;
  now: number;
  scores: Record<Team, number>;
  users: Record<Team, Record<string, Participant>>;
  combos: Record<Team, Record<string, Record<string, number>>>;
  challenge: Challenge;
  challengeProgress: ChallengeProgress;
  winner: Team | null;
  votes: Record<string, number>;
  penalty: string | null;
  eventCount: number;
};
