import { v4 as uuidv4 } from "uuid";
import { AnimationCommand, LogEntry } from "../types";

export class AnimationCommandModel implements AnimationCommand {
  id: string;
  characterId: string;
  action: string;
  params: Record<string, any>;
  duration?: number;
  timestamp: number;

  constructor(
    characterId: string,
    action: string,
    params: Record<string, any>,
    duration?: number
  ) {
    this.id = uuidv4();
    this.characterId = characterId;
    this.action = action;
    this.params = params;
    this.duration = duration;
    this.timestamp = Date.now();
  }
}

export class LogEntryModel implements LogEntry {
  id: string;
  sessionId: string;
  type: string;
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;

  constructor(
    sessionId: string,
    type: string,
    message: string,
    metadata?: Record<string, any>
  ) {
    this.id = uuidv4();
    this.sessionId = sessionId;
    this.type = type;
    this.message = message;
    this.timestamp = Date.now();
    this.metadata = metadata;
  }
}
