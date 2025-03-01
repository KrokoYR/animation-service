import { Env } from "./types";

export class Config {
  private static instance: Config;
  private env: Env | null = null;

  private constructor() {}

  static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  initialize(env: Env): void {
    this.env = env;
  }

  get environment(): string {
    return this.env?.ENVIRONMENT || "development";
  }

  get isProduction(): boolean {
    return this.environment === "production";
  }

  get isDevelopment(): boolean {
    return this.environment === "development";
  }

  get authEnabled(): boolean {
    return this.env?.AUTH_ENABLED?.toLowerCase() === "true";
  }

  get apiKeyHeader(): string {
    return this.env?.API_KEY_HEADER || "X-API-Key";
  }

  get jwtSecret(): string {
    return this.env?.JWT_SECRET || "default-jwt-secret-for-development-only";
  }

  get sessionDO(): DurableObjectNamespace | null {
    return this.env?.SESSION_DO || null;
  }

  get animationLogs(): KVNamespace | null {
    return this.env?.ANIMATION_LOGS || null;
  }

  get animationHistory(): KVNamespace | null {
    return this.env?.ANIMATION_HISTORY || null;
  }

  getEnv(): Env | null {
    return this.env;
  }
}

export default Config.getInstance();
