import { v4 as uuidv4 } from "uuid";
import { Character } from "../types";

export class CharacterModel implements Character {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  metadata: Record<string, any>;

  constructor(
    name: string,
    type: string,
    position = { x: 0, y: 0, z: 0 },
    rotation = { x: 0, y: 0, z: 0 },
    scale = { x: 1, y: 1, z: 1 },
    metadata: Record<string, any> = {}
  ) {
    this.id = uuidv4();
    this.name = name;
    this.type = type;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.metadata = metadata;
  }

  updatePosition(x: number, y: number, z: number): void {
    this.position = { x, y, z };
  }

  updateRotation(x: number, y: number, z: number): void {
    this.rotation = { x, y, z };
  }

  updateScale(x: number, y: number, z: number): void {
    this.scale = { x, y, z };
  }

  updateMetadata(metadata: Record<string, any>): void {
    this.metadata = { ...this.metadata, ...metadata };
  }
}
