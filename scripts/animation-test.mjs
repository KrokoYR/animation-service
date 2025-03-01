// Animation Platform Testing Script
import fetch from "node-fetch";
import WebSocket from "ws";

// Environment Configuration
const ENV = process.env.ANIMATION_ENV || "dev"; // 'dev' or 'prod'
const CONFIG = {
  dev: {
    apiUrl: "http://localhost:8787",
    apiKey: "dev-api-key", // Replace with your dev API key if needed
  },
  prod: {
    apiUrl:
      process.env.PROD_API_URL ||
      "https://animation-streaming-service.balzhinimaev1997.workers.dev",
    apiKey: process.env.PROD_API_KEY || "your-production-api-key",
  },
};

// Get current environment config
const currentConfig = CONFIG[ENV];
console.log(`Running in ${ENV} environment: ${currentConfig.apiUrl}`);

// Test state
let sessionId = null;
let characterId1 = null;
let characterId2 = null;
let ws1 = null;
let ws2 = null;

// Helper functions
async function makeRequest(endpoint, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": currentConfig.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(`${currentConfig.apiUrl}${endpoint}`, options);
  const text = await response.text();

  try {
    return {
      status: response.status,
      data: text ? JSON.parse(text) : null,
    };
  } catch (e) {
    return {
      status: response.status,
      data: text,
    };
  }
}

// Console logging with timestamps
function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

// WebSocket setup with promise for connection
function setupWebSocket(clientId) {
  return new Promise((resolve, reject) => {
    // Convert http/https to ws/wss for WebSocket connection
    const wsUrl = currentConfig.apiUrl.replace(/^http/, "ws");

    const ws = new WebSocket(`${wsUrl}/api/session/${sessionId}/connect`, {
      headers: {
        "X-Client-ID": clientId,
        "X-API-Key": currentConfig.apiKey,
      },
    });

    ws.on("open", () => {
      log(`Client ${clientId} connected`);
      resolve(ws);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        log(`Client ${clientId} received:`, message);
      } catch (e) {
        log(`Client ${clientId} received non-JSON message:`, data);
      }
    });

    ws.on("close", (code, reason) => {
      log(`Client ${clientId} disconnected: ${code} ${reason}`);
    });

    ws.on("error", (error) => {
      log(`Client ${clientId} error:`, error);
      reject(error);
    });
  });
}

// Main test sequence
async function runTests() {
  try {
    log(`Starting Animation Platform Tests in ${ENV} environment`);

    // 1. Session Management Tests
    log("TEST 1.1: Creating a new session");
    const createSessionResult = await makeRequest("/api/session", "POST", {
      name: "Test Animation Session",
      metadata: {
        description: "A test session for our animation platform",
        createdBy: "test-user",
      },
    });

    if (
      createSessionResult.status !== 201 ||
      !createSessionResult.data.sessionId
    ) {
      throw new Error(
        `Failed to create session: ${JSON.stringify(createSessionResult)}`
      );
    }

    sessionId = createSessionResult.data.sessionId;
    log(`Session created with ID: ${sessionId}`, createSessionResult.data);

    log("TEST 1.2: Listing all sessions");
    const listSessionsResult = await makeRequest("/api/session");
    log("Sessions list:", listSessionsResult.data);

    log("TEST 1.3: Getting session info");
    const sessionInfoResult = await makeRequest(
      `/api/session/${sessionId}/info`
    );
    log("Session info:", sessionInfoResult.data);

    log("TEST 1.4: Getting full session state");
    const sessionStateResult = await makeRequest(
      `/api/session/${sessionId}/state`
    );
    log("Session state:", sessionStateResult.data);

    log("TEST 1.5: Updating session status");
    const updateStatusResult = await makeRequest(
      `/api/session/${sessionId}/status`,
      "POST",
      {
        status: "active",
      }
    );
    log("Status update result:", updateStatusResult.data);

    log("TEST 1.6: Updating session metadata");
    const updateMetadataResult = await makeRequest(
      `/api/session/${sessionId}/metadata`,
      "POST",
      {
        environment: "testing",
        version: "1.0.0",
      }
    );
    log("Metadata update result:", updateMetadataResult.data);

    // 2. Character Management Tests
    log("TEST 2.1: Adding a character to the session");
    const addCharacter1Result = await makeRequest(
      `/api/session/${sessionId}/characters`,
      "POST",
      {
        name: "TestCharacter1",
        type: "humanoid",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        metadata: {
          color: "blue",
          speed: 5,
        },
      }
    );

    if (addCharacter1Result.status !== 201 || !addCharacter1Result.data.id) {
      throw new Error(
        `Failed to add character: ${JSON.stringify(addCharacter1Result)}`
      );
    }

    characterId1 = addCharacter1Result.data.id;
    log(
      `Character 1 created with ID: ${characterId1}`,
      addCharacter1Result.data
    );

    log("TEST 2.2: Adding a second character");
    const addCharacter2Result = await makeRequest(
      `/api/session/${sessionId}/characters`,
      "POST",
      {
        name: "TestCharacter2",
        type: "vehicle",
        position: { x: 10, y: 0, z: 10 },
        rotation: { x: 0, y: 45, z: 0 },
        scale: { x: 2, y: 2, z: 2 },
        metadata: {
          color: "red",
          speed: 10,
        },
      }
    );

    characterId2 = addCharacter2Result.data.id;
    log(
      `Character 2 created with ID: ${characterId2}`,
      addCharacter2Result.data
    );

    log("TEST 2.3: Listing all characters");
    const listCharactersResult = await makeRequest(
      `/api/session/${sessionId}/characters`
    );
    log("Characters list:", listCharactersResult.data);

    log("TEST 2.4: Getting specific character");
    const getCharacterResult = await makeRequest(
      `/api/session/${sessionId}/characters/${characterId1}`
    );
    log("Character details:", getCharacterResult.data);

    log("TEST 2.5: Updating character");
    const updateCharacterResult = await makeRequest(
      `/api/session/${sessionId}/characters/${characterId1}`,
      "PUT",
      {
        position: { x: 5, y: 0, z: 5 },
        metadata: {
          color: "green",
          speed: 7,
        },
      }
    );
    log("Character update result:", updateCharacterResult.data);

    // 3. WebSocket Connection Tests
    log("TEST 3.1: Connecting first client");
    try {
      ws1 = await setupWebSocket("test-client-1");

      // Wait for initial state messages
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log("TEST 3.2: Connecting second client");
      ws2 = await setupWebSocket("test-client-2");

      // Wait for initial state messages
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 4. Animation Command Tests
      log("TEST 4.1: Sending move command from Client 1");
      ws1.send(
        JSON.stringify({
          type: "animation_command",
          sessionId: sessionId,
          payload: {
            characterId: characterId1,
            action: "move",
            params: {
              position: { x: 10, y: 0, z: 0 },
            },
            duration: 2000,
          },
          timestamp: Date.now(),
        })
      );

      // Wait for command processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log("TEST 4.2: Sending rotate command from Client 1");
      ws1.send(
        JSON.stringify({
          type: "animation_command",
          sessionId: sessionId,
          payload: {
            characterId: characterId1,
            action: "rotate",
            params: {
              rotation: { x: 0, y: 90, z: 0 },
            },
            duration: 1000,
          },
          timestamp: Date.now(),
        })
      );

      // Wait for command processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log("TEST 4.3: Sending reset command from Client 2");
      ws2.send(
        JSON.stringify({
          type: "animation_command",
          sessionId: sessionId,
          payload: {
            characterId: characterId2,
            action: "reset",
            params: {},
            duration: 0,
          },
          timestamp: Date.now(),
        })
      );

      // Wait for command processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      log("TEST 4.4: Sending custom command from Client 2");
      ws2.send(
        JSON.stringify({
          type: "animation_command",
          sessionId: sessionId,
          payload: {
            characterId: characterId2,
            action: "dance",
            params: {
              style: "robot",
              intensity: 0.8,
            },
            duration: 5000,
          },
          timestamp: Date.now(),
        })
      );

      // Wait for command processing
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (wsError) {
      log("WebSocket test error:", wsError);
      log("Continuing with HTTP tests...");
    }

    // 5. Command History and Logs
    log("TEST 5.1: Checking command history");
    const historyResult = await makeRequest(
      `/api/session/${sessionId}/history`
    );
    log("Command history:", historyResult.data);

    log("TEST 5.2: Checking session logs");
    const logsResult = await makeRequest(`/api/session/${sessionId}/logs`);
    log("Session logs:", logsResult.data);

    log("TEST 5.3: Filtering logs by type");
    const filteredLogsResult = await makeRequest(
      `/api/session/${sessionId}/logs?type=COMMAND_EXECUTED`
    );
    log("Filtered logs:", filteredLogsResult.data);

    log("TEST 5.4: Checking archived history");
    const archivedHistoryResult = await makeRequest(
      `/api/session/${sessionId}/history?archived=true&limit=10`
    );
    log("Archived history:", archivedHistoryResult.data);

    // 6. Cleanup and Disconnection Tests
    log("TEST 6.1: Deleting a character");
    const deleteCharacterResult = await makeRequest(
      `/api/session/${sessionId}/characters/${characterId2}`,
      "DELETE"
    );
    log("Character deletion result:", deleteCharacterResult);

    // Close WebSocket connections if they were successfully established
    log("TEST 6.2: Disconnecting WebSocket clients");
    if (ws1 && ws1.readyState === WebSocket.OPEN) {
      ws1.close();
      // Wait a moment for the first disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (ws2 && ws2.readyState === WebSocket.OPEN) {
      ws2.close();
      // Wait for disconnections to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    log("TEST 6.3: Checking session status after all clients disconnect");
    const finalStatusResult = await makeRequest(
      `/api/session/${sessionId}/info`
    );
    log("Final session status:", finalStatusResult.data);

    log("All tests completed successfully!");
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    // Cleanup
    if (ws1 && ws1.readyState === WebSocket.OPEN) ws1.close();
    if (ws2 && ws2.readyState === WebSocket.OPEN) ws2.close();
  }
}

// Helper to allow specific test execution
async function runSpecificTest(testName) {
  try {
    log(`Running specific test: ${testName}`);

    switch (testName) {
      case "create-session":
        await createSession();
        break;
      case "list-sessions":
        await listSessions();
        break;
      // Add other specific test cases as needed
      default:
        log(`Unknown test: ${testName}`);
    }
  } catch (error) {
    console.error(`Test ${testName} failed:`, error);
  }
}

// Handle specific test execution if provided
const specificTest = process.argv[2];
if (specificTest) {
  runSpecificTest(specificTest);
} else {
  // Run all tests
  runTests();
}

// Helper functions for specific tests
async function createSession() {
  const result = await makeRequest("/api/session", "POST", {
    name: "Test Animation Session",
    metadata: {
      description: "A test session for our animation platform",
      createdBy: "test-user",
    },
  });

  log("Create session result:", result);
  return result;
}

async function listSessions() {
  const result = await makeRequest("/api/session");
  log("Sessions list:", result.data);
  return result;
}
