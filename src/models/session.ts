import { v4 as uuidv4 } from "uuid";
import { Session, SessionStatus, Character } from "../types";

export class SessionModel implements Session {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: SessionStatus;
  activeCharacters: Character[];
  metadata: Record<string, any>;

  constructor({
    id,
    name,
    createdAt,
    updatedAt,
    status,
    activeCharacters,
    metadata,
  }: Session) {
    this.id = id;
    this.name = name;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.status = status;
    this.activeCharacters = activeCharacters || [];
    this.metadata = metadata;
  }

  addCharacter(character: Character): void {
    this.activeCharacters.push(character);
    this.updatedAt = Date.now();
  }

  removeCharacter(characterId: string): boolean {
    const initialLength = this.activeCharacters.length;
    this.activeCharacters = this.activeCharacters.filter(
      (c) => c.id !== characterId
    );
    this.updatedAt = Date.now();
    return initialLength !== this.activeCharacters.length;
  }

  updateStatus(status: SessionStatus): void {
    this.status = status;
    this.updatedAt = Date.now();
  }

  updateMetadata(metadata: Record<string, any>): void {
    this.metadata = { ...this.metadata, ...metadata };
    this.updatedAt = Date.now();
  }
}
