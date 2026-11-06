// Types shared by the server and the React client, so both always agree on the data shape.
export type Level = 1 | 2 | 3;
export type LikeState = 'none' | 'can' | 'done';

export interface PlayerPublic { id: number; username: string; color: string }

export interface CardPublic {
  text: string;
  level: Level;
  is_original: boolean;
  likes: number;
  seq: number;          // changes when a NEW card is drawn
  likeState: LikeState; // per viewer. Note: the author of a custom card is never sent.
}

export interface GameState {
  mode: 'original' | 'mixed';
  discordLink: string | null;
  players: PlayerPublic[];
  currentPlayerId: number | null;
  card: CardPublic | null;
  awaitingPick: boolean;
  answererId: number | null;
  hands: number[];
  drawerSpeaking: boolean;
  spoken: number[];
  level: Level;
  progress: { done: number; total: number };
  canAdvance: boolean;
  canFinish: boolean;
  finished: boolean;
}

export interface ChatMessage { username: string; color: string; text: string }

export interface Me {
  id: number; username: string; color: string;
  created: number; likes: number;
  creatorLevel: string; endorsementLevel: string;
  nextCreatorAt: number | null; nextEndorseAt: number | null;
}

export interface MyQuestion { id: number; text: string; level: Level; likes: number }

export interface ServerToClientEvents {
  state: (s: GameState) => void;
  history: (m: ChatMessage[]) => void;
  chat: (m: ChatMessage) => void;
  'error-msg': (m: string) => void;
}

export interface ClientToServerEvents {
  join: (code: string) => void;
  chat: (text: string) => void;
  draw: (level: number) => void;
  pickAnswerer: (userId: number) => void;
  raiseHand: () => void;
  pickSpeaker: (userId: number) => void;
  finished: () => void;
  advanceLevel: () => void;
  finishGame: () => void;
  like: () => void;
  nextTurn: () => void;
}
