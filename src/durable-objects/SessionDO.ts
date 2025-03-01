import merge from "deepmerge";

import { SessionModel } from "../models/session";
import { AnimationCommandModel, LogEntryModel } from "../models/animation";
import {
  SessionState,
  WebSocketMessage,
  WebSocketMessageType,
  AnimationCommand,
  SessionStatus,
  Character,
  Session,
  Env,
} from "../types";

export class SessionDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private session!: SessionModel;
  private clients: Map<WebSocket, string>;
  private characters: Map<string, Character>;
  private commandHistory: AnimationCommandModel[];
  private logs: LogEntryModel[];
  private initialized: boolean;
  private initPromise: Promise<void>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
    this.characters = new Map();
    this.commandHistory = [];
    this.logs = [];
    this.initialized = false;

    this.state.getWebSockets().forEach((webSocket) => {
      const clientId = webSocket.deserializeAttachment() as string;
      this.clients.set(webSocket, clientId);
    });

    this.initPromise = this.initializeSession();
  }

  private async initializeSession(): Promise<void> {
    if (this.initialized) return;

    const sessionData = await this.state.storage.get<Session>("session");
    if (sessionData) {
      this.session = new SessionModel(sessionData);
    } else {
      this.session = new SessionModel({
        id: this.state.id.toString(),
        name: `Session ${this.state.id.toString().substring(0, 8)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: SessionStatus.CREATED,
        activeCharacters: [],
        metadata: {},
      });
      await this.state.storage.put("session", this.session);
    }

    const characterData =
      await this.state.storage.get<Map<string, Character>>("characters");
    if (characterData) {
      this.characters = characterData;

      // Update session's active characters list
      // We'll clear the current list and repopulate it
      this.session.activeCharacters = [];
      for (const character of this.characters.values()) {
        this.session.addCharacter(character);
      }
    }

    const commandHistory =
      await this.state.storage.get<AnimationCommandModel[]>("commandHistory");
    if (commandHistory) {
      this.commandHistory = commandHistory;
    }

    const logs = await this.state.storage.get<LogEntryModel[]>("logs");
    if (logs) {
      this.logs = logs;
    }

    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.initPromise;

    const url = new URL(request.url);
    const path = url.pathname.slice(1).split("/");

    try {
      if (path[0] === "connect") {
        if (request.headers.get("Upgrade") !== "websocket") {
          return new Response("Expected WebSocket", { status: 400 });
        }

        const clientId =
          request.headers.get("X-Client-ID") || crypto.randomUUID();
        const pair = new WebSocketPair();

        await this.handleWebSocketConnection(pair[1], clientId);

        return new Response(null, {
          status: 101,
          webSocket: pair[0],
        });
      }

      switch (path[0]) {
        case "info":
          this.session.updatedAt = Date.now();
          await this.saveSessionData();
          return this.jsonResponse(this.session);

        case "state":
          // Return full session state
          this.session.updatedAt = Date.now();
          await this.saveSessionData();
          return this.jsonResponse(await this.getSessionState());

        case "characters":
          return await this.handleCharactersRequest(request, path.slice(1));

        case "status":
          return await this.handleStatusRequest(request);

        case "metadata":
          return await this.handleMetadataRequest(request);

        case "logs":
          return await this.handleLogsRequest(request, url);

        case "history":
          return await this.handleHistoryRequest(request, url);

        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (error) {
      await this.logError("API_ERROR", error);

      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  private jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  private async handleCharactersRequest(
    request: Request,
    path: string[]
  ): Promise<Response> {
    // path = [] -> /characters
    if (path.length === 0) {
      switch (request.method) {
        case "GET": {
          return this.jsonResponse(Array.from(this.characters.values()));
        }
        case "POST": {
          const data = (await request.json()) as Partial<Character>;
          const character = await this.addCharacter(data);
          return this.jsonResponse(character, 201);
        }
        default:
          return new Response("Method not allowed", { status: 405 });
      }
    }

    // path = [characterId] -> /characters/:characterId
    const characterId = path[0];
    const character = this.characters.get(characterId);

    if (!character) {
      return new Response("Character not found", { status: 404 });
    }

    switch (request.method) {
      case "GET": {
        return this.jsonResponse(character);
      }
      case "PUT": {
        const data = (await request.json()) as Partial<Character>;
        const updatedCharacter = await this.updateCharacter(characterId, data);
        return this.jsonResponse(updatedCharacter);
      }
      case "DELETE": {
        await this.removeCharacter(characterId);
        return new Response(null, { status: 204 });
      }
      default:
        return new Response("Method not allowed", { status: 405 });
    }
  }

  private async handleStatusRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const data = (await request.json()) as { status: SessionStatus };

    if (!data.status || !Object.values(SessionStatus).includes(data.status)) {
      return new Response("Invalid status", { status: 400 });
    }

    this.session.updateStatus(data.status);
    await this.saveSessionData();

    this.broadcastMessage({
      type: WebSocketMessageType.SESSION_STATUS,
      sessionId: this.session.id,
      payload: {
        status: this.session.status,
      },
      timestamp: Date.now(),
    });

    return this.jsonResponse({ status: this.session.status });
  }

  private async handleMetadataRequest(request: Request): Promise<Response> {
    switch (request.method) {
      case "GET": {
        return this.jsonResponse(this.session.metadata);
      }

      case "POST":
      case "PUT": {
        const metadata = (await request.json()) as Record<string, any>;

        if (!metadata || typeof metadata !== "object") {
          return new Response("Invalid metadata: must be an object", {
            status: 400,
          });
        }

        this.session.updateMetadata(metadata);
        await this.saveSessionData();

        this.broadcastMessage({
          type: WebSocketMessageType.SESSION_STATUS,
          sessionId: this.session.id,
          payload: {
            metadata: this.session.metadata,
          },
          timestamp: Date.now(),
        });

        return this.jsonResponse(this.session.metadata);
      }

      case "DELETE": {
        const url = new URL(request.url);
        const key = url.searchParams.get("key");

        if (!key) {
          return new Response("Missing metadata key parameter", {
            status: 400,
          });
        }

        if (key in this.session.metadata) {
          const updatedMetadata = { ...this.session.metadata };
          delete updatedMetadata[key];

          this.session.updateMetadata(updatedMetadata);
          await this.saveSessionData();

          return this.jsonResponse({ deleted: key });
        } else {
          return new Response(`Metadata key "${key}" not found`, {
            status: 404,
          });
        }
      }
      default: {
        return new Response("Method not allowed", { status: 405 });
      }
    }
  }

  private async handleLogsRequest(
    request: Request,
    url: URL
  ): Promise<Response> {
    switch (request.method) {
      case "GET": {
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const type = url.searchParams.get("type") || undefined;

        if (url.searchParams.get("archived") === "true") {
          try {
            const archivedLogs = await this.getArchivedLogs(limit, type);
            return this.jsonResponse(archivedLogs);
          } catch (error) {
            return this.jsonResponse(
              { error: "Failed to retrieve archived logs" },
              500
            );
          }
        }

        let filteredLogs = this.logs;
        if (type) {
          filteredLogs = filteredLogs.filter((log) => log.type === type);
        }

        return this.jsonResponse(filteredLogs.slice(0, limit));
      }
      default: {
        return new Response("Method not allowed", { status: 405 });
      }
    }
  }

  private async handleHistoryRequest(
    request: Request,
    url: URL
  ): Promise<Response> {
    switch (request.method) {
      case "GET": {
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const characterId = url.searchParams.get("characterId") || undefined;

        if (url.searchParams.get("archived") === "true") {
          try {
            const archivedHistory = await this.getArchivedHistory(
              limit,
              characterId
            );
            return this.jsonResponse(archivedHistory);
          } catch (error) {
            return this.jsonResponse(
              { error: "Failed to retrieve archived history" },
              500
            );
          }
        }

        let filteredHistory = this.commandHistory;
        if (characterId) {
          filteredHistory = filteredHistory.filter(
            (cmd) => cmd.characterId === characterId
          );
        }

        return this.jsonResponse(filteredHistory.slice(0, limit));
      }
      default: {
        return new Response("Method not allowed", { status: 405 });
      }
    }
  }

  private async handleWebSocketConnection(
    webSocket: WebSocket,
    clientId: string
  ): Promise<void> {
    this.state.acceptWebSocket(webSocket);
    webSocket.serializeAttachment(clientId);
    this.clients.set(webSocket, clientId);

    if (this.session.status === SessionStatus.CREATED) {
      this.session.status = SessionStatus.ACTIVE;
      await this.saveSessionData();
    }

    await this.logEvent("CLIENT_CONNECTED", `Client ${clientId} connected`);

    webSocket.send(
      JSON.stringify({
        type: WebSocketMessageType.SESSION_STATUS,
        sessionId: this.session.id,
        payload: await this.getSessionState(),
        timestamp: Date.now(),
      })
    );

    this.broadcastMessage(
      {
        type: WebSocketMessageType.CONNECT,
        sessionId: this.session.id,
        payload: { clientId },
        timestamp: Date.now(),
      },
      webSocket
    );
  }

  async webSocketMessage(webSocket: WebSocket, message: string): Promise<void> {
    try {
      const clientId = this.clients.get(webSocket);
      if (!clientId) {
        throw new Error("Unknown client");
      }

      const data = JSON.parse(message) as WebSocketMessage;

      switch (data.type) {
        case WebSocketMessageType.ANIMATION_COMMAND:
          await this.handleAnimationCommand(
            clientId,
            data.payload as AnimationCommand
          );
          break;

        case WebSocketMessageType.CHARACTER_UPDATE:
          await this.handleCharacterUpdate(data.payload);
          break;

        case WebSocketMessageType.PING:
          webSocket.send(
            JSON.stringify({
              type: WebSocketMessageType.PONG,
              sessionId: this.session.id,
              payload: null,
              timestamp: Date.now(),
            })
          );
          break;

        default:
          throw new Error(`Unsupported message type: ${data.type}`);
      }
    } catch (error) {
      await this.logError("WEBSOCKET_ERROR", error);

      webSocket.send(
        JSON.stringify({
          type: WebSocketMessageType.ERROR,
          sessionId: this.session.id,
          payload: { error: (error as Error).message },
          timestamp: Date.now(),
        })
      );
    }
  }

  async webSocketClose(webSocket: WebSocket): Promise<void> {
    const clientId = this.clients.get(webSocket);
    if (clientId) {
      await this.logEvent(
        "CLIENT_DISCONNECTED",
        `Client ${clientId} disconnected`
      );

      this.clients.delete(webSocket);

      this.broadcastMessage({
        type: WebSocketMessageType.DISCONNECT,
        sessionId: this.session.id,
        payload: { clientId },
        timestamp: Date.now(),
      });

      if (
        this.clients.size === 0 &&
        this.session.status === SessionStatus.ACTIVE
      ) {
        this.session.status = SessionStatus.PAUSED;
        await this.saveSessionData();
      }
    }
  }

  async webSocketError(webSocket: WebSocket, error: Error): Promise<void> {
    const clientId = this.clients.get(webSocket);

    await this.logError("WEBSOCKET_CONNECTION_ERROR", error, { clientId });
    await this.webSocketClose(webSocket);
  }

  private async handleAnimationCommand(
    clientId: string,
    command: AnimationCommand
  ): Promise<void> {
    if (!command.characterId || !command.action) {
      throw new Error("Invalid command: missing required fields");
    }

    const character = this.characters.get(command.characterId);
    if (!character) {
      throw new Error(`Character with ID ${command.characterId} not found`);
    }

    const commandModel = new AnimationCommandModel(
      command.characterId,
      command.action,
      command.params,
      command.duration
    );

    this.commandHistory.unshift(commandModel);
    if (this.commandHistory.length > 100) {
      this.commandHistory.pop();
    }
    await this.saveCommandHistory();

    let updatedCharacter: Character;
    switch (command.action.toLowerCase()) {
      case "start":
        updatedCharacter = this.updateCharacterProperties(character, {});
        await this.logEvent(
          "COMMAND_EXECUTED",
          `Start command executed on character ${character.name}`
        );
        break;

      case "stop":
        updatedCharacter = this.updateCharacterProperties(character, {});
        await this.logEvent(
          "COMMAND_EXECUTED",
          `Stop command executed on character ${character.name}`
        );
        break;

      case "rotate":
        const rotation = command.params.rotation || {};
        updatedCharacter = this.updateCharacterProperties(character, {
          rotation: {
            x: character.rotation.x + (rotation.x || 0),
            y: character.rotation.y + (rotation.y || 0),
            z: character.rotation.z + (rotation.z || 0),
          },
        });
        await this.logEvent(
          "COMMAND_EXECUTED",
          `Rotate command executed on character ${character.name}`
        );
        break;

      case "move":
        const position = command.params.position || {};
        updatedCharacter = this.updateCharacterProperties(character, {
          position: {
            x: character.position.x + (position.x || 0),
            y: character.position.y + (position.y || 0),
            z: character.position.z + (position.z || 0),
          },
        });
        await this.logEvent(
          "COMMAND_EXECUTED",
          `Move command executed on character ${character.name}`
        );
        break;

      case "reset":
        updatedCharacter = this.updateCharacterProperties(character, {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        });
        await this.logEvent(
          "COMMAND_EXECUTED",
          `Reset command executed on character ${character.name}`
        );
        break;

      default:
        updatedCharacter = this.updateCharacterProperties(character, {
          metadata: {
            ...character.metadata,
            lastCommand: command.action,
            lastCommandParams: command.params,
            lastCommandTime: Date.now(),
          },
        });
        await this.logEvent(
          "COMMAND_EXECUTED",
          `Custom command "${command.action}" executed on character ${character.name}`
        );
    }

    this.broadcastMessage({
      type: WebSocketMessageType.CHARACTER_UPDATE,
      sessionId: this.session.id,
      payload: updatedCharacter,
      timestamp: Date.now(),
    });

    await this.archiveCommand(commandModel);
  }

  private async handleCharacterUpdate(
    data: Partial<Character> & { id: string }
  ): Promise<void> {
    if (!data.id) {
      throw new Error("Character ID is required");
    }

    const character = this.characters.get(data.id);

    if (!character) {
      throw new Error(`Character with ID ${data.id} not found`);
    }

    const updatedCharacter = await this.updateCharacter(data.id, data);
    this.broadcastMessage({
      type: WebSocketMessageType.CHARACTER_UPDATE,
      sessionId: this.session.id,
      payload: updatedCharacter,
      timestamp: Date.now(),
    });
  }

  private async addCharacter(data: Partial<Character>): Promise<Character> {
    const characterId = data.id || crypto.randomUUID();

    const character: Character = {
      id: characterId,
      name: data.name || `Character ${characterId.substring(0, 6)}`,
      type: data.type || "default",
      position: data.position || { x: 0, y: 0, z: 0 },
      rotation: data.rotation || { x: 0, y: 0, z: 0 },
      scale: data.scale || { x: 1, y: 1, z: 1 },
      metadata: data.metadata || {},
    };

    this.characters.set(characterId, character);
    this.session.addCharacter(character);

    await this.saveCharacters();
    await this.saveSessionData();

    await this.logEvent(
      "CHARACTER_ADDED",
      `Character ${character.name} added to session`
    );

    this.broadcastMessage({
      type: WebSocketMessageType.CHARACTER_UPDATE,
      sessionId: this.session.id,
      payload: character,
      timestamp: Date.now(),
    });

    return character;
  }

  private async updateCharacter(
    id: string,
    data: Partial<Character>
  ): Promise<Character> {
    const character = this.characters.get(id);

    if (!character) {
      throw new Error(`Character with ID ${id} not found`);
    }

    const updatedCharacter = this.updateCharacterProperties(character, data);
    await this.saveCharacters();

    // First remove old version and then add updated version to keep session's active characters list in sync
    this.session.removeCharacter(id);
    this.session.addCharacter(updatedCharacter);
    await this.saveSessionData();

    return updatedCharacter;
  }

  private updateCharacterProperties(
    character: Character,
    updates: Partial<Character>
  ): Character {
    const updatedCharacter = merge<Character>(character, updates);

    this.characters.set(character.id, updatedCharacter);

    return updatedCharacter;
  }

  private async removeCharacter(id: string): Promise<void> {
    if (!this.characters.has(id)) {
      throw new Error(`Character with ID ${id} not found`);
    }

    const character = this.characters.get(id)!;
    this.characters.delete(id);

    const wasRemoved = this.session.removeCharacter(id);
    if (!wasRemoved) {
      console.warn(
        `Character ${id} not found in session's active characters list`
      );
    }

    await this.saveCharacters();
    await this.saveSessionData();

    await this.logEvent(
      "CHARACTER_REMOVED",
      `Character ${character.name} removed from session`
    );

    this.broadcastMessage({
      type: WebSocketMessageType.CHARACTER_UPDATE,
      sessionId: this.session.id,
      payload: { id, removed: true },
      timestamp: Date.now(),
    });
  }

  private async getSessionState(): Promise<SessionState> {
    return {
      session: this.session,
      commandHistory: this.commandHistory,
      clients: Array.from(this.clients.values()),
      logs: this.logs,
    };
  }

  private broadcastMessage(
    message: WebSocketMessage,
    excludeWebSocket: WebSocket | null = null
  ): void {
    const messageString = JSON.stringify(message);

    for (const [webSocket, _] of this.clients.entries()) {
      if (webSocket !== excludeWebSocket) {
        try {
          webSocket.send(messageString);
        } catch (error) {
          // Socket is probably dead, remove it
          this.clients.delete(webSocket);
        }
      }
    }
  }

  private async saveSessionData(): Promise<void> {
    await this.state.storage.put("session", this.session);
  }

  private async saveCharacters(): Promise<void> {
    await this.state.storage.put("characters", this.characters);
  }

  private async saveCommandHistory(): Promise<void> {
    await this.state.storage.put("commandHistory", this.commandHistory);
  }

  private async saveLogs(): Promise<void> {
    await this.state.storage.put("logs", this.logs);
  }

  private async logEvent(
    type: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<LogEntryModel> {
    return await this.addLogEntry(type, message, metadata);
  }

  private async logError(
    type: string,
    error: unknown,
    metadata?: Record<string, any>
  ): Promise<LogEntryModel> {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error);

    const errorMetadata = {
      ...metadata,
      stack: error instanceof Error ? error.stack : undefined,
    };

    return await this.addLogEntry(type, errorMessage, errorMetadata);
  }

  private async addLogEntry(
    type: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<LogEntryModel> {
    const logEntry = new LogEntryModel(
      this.session.id,
      type,
      message,
      metadata
    );

    this.logs.unshift(logEntry);
    if (this.logs.length > 100) {
      this.logs.pop();
    }

    await this.saveLogs();
    await this.archiveLog(logEntry);

    return logEntry;
  }

  private async archiveLog(log: LogEntryModel): Promise<void> {
    try {
      const key = `log:${this.session.id}:${log.timestamp}:${log.id}`;
      await this.env.ANIMATION_LOGS.put(key, JSON.stringify(log));
    } catch (error) {
      // Just log to console, don't throw - this is a background operation
      console.error("Failed to archive log:", error);
    }
  }

  private async archiveCommand(command: AnimationCommandModel): Promise<void> {
    try {
      const key = `command:${this.session.id}:${command.timestamp}:${command.characterId}`;
      await this.env.ANIMATION_HISTORY.put(key, JSON.stringify(command));
    } catch (error) {
      // Just log to console, don't throw - this is a background operation
      console.error("Failed to archive command:", error);
    }
  }

  private async getArchivedLogs(
    limit: number,
    type?: string
  ): Promise<LogEntryModel[]> {
    const prefix = `log:${this.session.id}:`;
    const listResult = await this.env.ANIMATION_LOGS.list({
      prefix,
      limit: limit * 2,
    });

    const logs: LogEntryModel[] = [];

    for (const key of listResult.keys) {
      const logData = await this.env.ANIMATION_LOGS.get(key.name);
      if (logData) {
        const log = JSON.parse(logData) as LogEntryModel;

        if (!type || log.type === type) {
          logs.push(log);

          if (logs.length >= limit) break;
        }
      }
    }

    return logs.sort((a, b) => b.timestamp - a.timestamp);
  }

  private async getArchivedHistory(
    limit: number,
    characterId?: string
  ): Promise<AnimationCommandModel[]> {
    const prefix = `command:${this.session.id}:`;
    const listResult = await this.env.ANIMATION_HISTORY.list({
      prefix,
      limit: limit * 2,
    });

    const commands: AnimationCommandModel[] = [];

    for (const key of listResult.keys) {
      const commandData = await this.env.ANIMATION_HISTORY.get(key.name);
      if (commandData) {
        const command = JSON.parse(commandData) as AnimationCommandModel;

        if (!characterId || command.characterId === characterId) {
          commands.push(command);

          if (commands.length >= limit) break;
        }
      }
    }

    return commands.sort((a, b) => b.timestamp - a.timestamp);
  }
}
