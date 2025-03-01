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

  static fromJSON(json: string): AnimationCommandModel {
    const data = JSON.parse(json);
    const command = new AnimationCommandModel(
      data.characterId,
      data.action,
      data.params,
      data.duration
    );
    command.id = data.id;
    command.timestamp = data.timestamp;
    return command;
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

  static fromJSON(json: string): LogEntryModel {
    const data = JSON.parse(json);
    const log = new LogEntryModel(
      data.sessionId,
      data.type,
      data.message,
      data.metadata
    );
    log.id = data.id;
    log.timestamp = data.timestamp;
    return log;
  }
}
