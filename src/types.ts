import { SessionModel } from "./models/session";

export interface Env {
  SESSION_DO: DurableObjectNamespace;
  ANIMATION_LOGS: KVNamespace;
  ANIMATION_HISTORY: KVNamespace;
  ENVIRONMENT: string;
  AUTH_ENABLED: string;
  API_KEY_HEADER: string;
  JWT_SECRET: string;
}

export enum WebSocketMessageType {
  CONNECT = "connect",
  DISCONNECT = "disconnect",
  ANIMATION_COMMAND = "animation_command",
  CHARACTER_UPDATE = "character_update",
  SESSION_STATUS = "session_status",
  ERROR = "error",
  PING = "ping",
  PONG = "pong",
}

export interface WebSocketMessage {
  type: WebSocketMessageType;
  sessionId?: string;
  payload: any;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  activeCharacters: Character[];
  metadata: Record<string, any>;
}

export enum SessionStatus {
  CREATED = "created",
  ACTIVE = "active",
  PAUSED = "paused",
  COMPLETED = "completed",
  ERROR = "error",
}

export interface Character {
  id: string;
  name: string;
  type: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
  metadata: Record<string, any>;
}

export interface AnimationCommand {
  characterId: string;
  action: string;
  params: Record<string, any>;
  duration?: number;
}

export interface LogEntry {
  id: string;
  sessionId: string;
  type: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface SessionState {
  session: SessionModel;
  commandHistory: AnimationCommand[];
  clients: string[]; // WebSocket client IDs
  logs: LogEntry[];
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
}

export enum UserRole {
  ADMIN = "admin",
  USER = "user",
  GUEST = "guest",
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiError {
  status: number;
  message: string;
  details?: any;
}
