import { Env, SessionStatus, WebSocketMessageType } from "./types";
import { SessionModel } from "./models/session";
export { SessionDO } from "./durable-objects/SessionDO";

// Error handling wrapper
async function handleErrors(
  request: Request,
  func: () => Promise<Response>
): Promise<Response> {
  try {
    return await func();
  } catch (err) {
    const error = err as Error;
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Client-ID",
    };

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(
        JSON.stringify({
          type: WebSocketMessageType.ERROR,
          payload: { error: error.message },
          timestamp: Date.now(),
        })
      );
      pair[1].close(1011, "Session initialization error");
      return new Response(null, { status: 101, webSocket: pair[0] });
    } else {
      return new Response(
        JSON.stringify({
          error: error.message,
          stack:
            process.env.NODE_ENV === "development" ? error.stack : undefined,
        }),
        { status: 500, headers }
      );
    }
  }
}

// Authentication middleware
async function authenticate(request: Request, env: Env): Promise<boolean> {
  // Skip auth if disabled in environment
  if (env.AUTH_ENABLED !== "true") {
    return true;
  }

  // Check for API key in header
  const apiKey = request.headers.get(env.API_KEY_HEADER || "X-API-Key");
  if (apiKey) {
    // In a real implementation, you'd validate against stored API keys
    // This is a simplified example
    return apiKey.length >= 32;
  }

  // Check for JWT token
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);

    try {
      // In a real implementation, you'd validate the JWT signature
      // This is a simplified example
      const payload = JSON.parse(atob(token.split(".")[1]));
      return !!payload.sub;
    } catch {
      return false;
    }
  }

  return false;
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-ID",
};

// Main worker export
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await handleErrors(request, async () => {
      // Parse URL
      const url = new URL(request.url);
      const path = url.pathname.slice(1).split("/");

      // Handle CORS preflight requests
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // API routes
      if (path[0] === "api") {
        return handleApiRequest(path.slice(1), request, env);
      }

      // Serve frontend (if applicable)
      if (!path[0]) {
        // In a real implementation, you'd serve actual HTML/JS/CSS
        return new Response("Animation Platform", {
          headers: { "Content-Type": "text/html" },
        });
      }

      // Not found
      return new Response("Not found", { status: 404 });
    });
  },
};

// Handle API requests
async function handleApiRequest(
  path: string[],
  request: Request,
  env: Env
): Promise<Response> {
  // Add CORS headers to all responses
  const responseInit = {
    headers: corsHeaders,
  };

  // Handle session-related endpoints
  if (path[0] === "session") {
    // Create new session
    if (!path[1] && request.method === "POST") {
      // Check authentication
      const isAuthenticated = await authenticate(request, env);
      if (!isAuthenticated) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      // Parse request body for session configuration
      let sessionName = "Animation Session";
      let metadata = {};

      try {
        const body = (await request.json()) as {
          name?: string;
          metadata?: Record<string, any>;
        };
        if (body.name) sessionName = body.name;
        if (body.metadata) metadata = body.metadata;
      } catch {
        // Continue with defaults if body parsing fails
      }

      // Create new session with unique ID
      const id = env.SESSION_DO.newUniqueId();
      const idString = id.toString();

      // Initialize the session with basic data
      const sessionObject = env.SESSION_DO.get(id);

      // We don't need to wait for this to complete
      sessionObject
        .fetch(
          new Request("https://placeholder/info", {
            method: "POST",
            body: JSON.stringify({
              name: sessionName,
              metadata,
            }),
          })
        )
        .catch(console.error);

      // Store session metadata in KV for listing sessions
      const sessionMetadata = {
        id: idString,
        name: sessionName,
        createdAt: Date.now(),
        status: SessionStatus.CREATED,
      };

      await env.ANIMATION_LOGS.put(
        `session:metadata:${idString}`,
        JSON.stringify(sessionMetadata)
      );

      return new Response(
        JSON.stringify({ sessionId: idString, name: sessionName }),
        { status: 201, headers: corsHeaders }
      );
    }

    // List all sessions
    if (!path[1] && request.method === "GET") {
      // Check authentication
      const isAuthenticated = await authenticate(request, env);
      if (!isAuthenticated) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: corsHeaders,
        });
      }

      // List all sessions from KV
      const sessionsList = await env.ANIMATION_LOGS.list({
        prefix: "session:metadata:",
      });
      const sessions = [];

      for (const key of sessionsList.keys) {
        const sessionData = (await env.ANIMATION_LOGS.get(
          key.name,
          "json"
        )) as SessionModel;
        if (sessionData) {
          sessions.push(sessionData);
        }
      }

      return new Response(JSON.stringify({ sessions }), {
        headers: corsHeaders,
      });
    }

    // Handle specific session
    if (path[1]) {
      const sessionId = path[1];
      let id;

      try {
        // Parse session ID
        id = env.SESSION_DO.idFromString(sessionId);
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid session ID" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      // Get session Durable Object
      const sessionObject = env.SESSION_DO.get(id);

      // Forward request to the session
      const newPath = path.slice(2);
      const newUrl = new URL(request.url);
      newUrl.pathname = "/" + newPath.join("/");

      // Authentication is handled within the Durable Object for most operations
      // For certain operations, we authenticate here
      if (newPath[0] !== "connect" && newPath[0] !== "info") {
        const isAuthenticated = await authenticate(request, env);
        if (!isAuthenticated) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: corsHeaders,
          });
        }
      }

      // Forward request to session durable object
      const response = await sessionObject.fetch(new Request(newUrl, request));

      // Add CORS headers to response
      const newResponse = new Response(response.body, response);

      // Copy original headers
      for (const [key, value] of response.headers.entries()) {
        newResponse.headers.set(key, value);
      }

      // Add CORS headers
      for (const [key, value] of Object.entries(corsHeaders)) {
        newResponse.headers.set(key, value);
      }

      return newResponse;
    }
  }

  // Not found
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: corsHeaders,
  });
}
