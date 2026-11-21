/**
 * AE-MCP Host Script (ExtendScript)
 *
 * This script runs in After Effects and processes commands from the MCP server.
 * IMPORTANT: This file MUST be ES3 compatible!
 */

// Global state
var AEMCP = {
  commandsFolder: null,
  processedCommands: {},
  processedCount: 0,
  pollInterval: 100, // ms
  isRunning: false,
  clientPrefixes: {},
  commandInProgress: false
};

/**
 * Initialize the MCP bridge
 */
function initMCP() {
  // Set up commands folder in Documents
  var documentsPath = Folder.myDocuments.fsName;
  AEMCP.commandsFolder = new Folder(documentsPath + "/ae-mcp-commands");

  if (!AEMCP.commandsFolder.exists) {
    AEMCP.commandsFolder.create();
  }

  // Self-heal off-screen floating panel coordinates if dragged past display bounds
  if (typeof app !== "undefined" && app && app.preferences && typeof PREFType !== "undefined") {
    try {
      var prefSec = "CEP_com.aemcp.panel";
      var prefType = PREFType.PREF_Type_MACHINE_SPECIFIC;
      if (app.preferences.havePref(prefSec, "PlugPlugWindowGeometry.x", prefType)) {
        var gx = parseFloat(app.preferences.getPrefAsString(prefSec, "PlugPlugWindowGeometry.x", prefType));
        var gy = parseFloat(app.preferences.getPrefAsString(prefSec, "PlugPlugWindowGeometry.y", prefType));
        if (isNaN(gx) || isNaN(gy) || gx < 0 || gy < 0 || gx > 1600 || gy > 900) {
          app.preferences.savePrefAsString(prefSec, "PlugPlugWindowGeometry.x", "300.000000", prefType);
          app.preferences.savePrefAsString(prefSec, "PlugPlugWindowGeometry.y", "200.000000", prefType);
          app.preferences.saveToDisk();
        }
      }
    } catch (ePref) {}
  }

  AEMCP.isRunning = true;
  return JSON.stringify({ success: true, folder: AEMCP.commandsFolder.fsName });
}

/**
 * Return true only for pending .json command files (excluding .response/.processed/.tmp).
 */
function isCommandJsonFile(file) {
  if (!file || typeof file.open !== "function") return false;
  var name = file.name;
  if (!name || name.length <= 5) return false;
  var lower = name.toLowerCase();
  return lower.substring(lower.length - 5) === ".json";
}

/**
 * Process at most one pending command per call so After Effects' Win32 message loop
 * can handle user mouse and keyboard input between commands.
 */
function processCommands() {
  if (!AEMCP.commandsFolder || !AEMCP.commandsFolder.exists) {
    return JSON.stringify({ processed: 0, hasMore: false });
  }

  var files = AEMCP.commandsFolder.getFiles();
  var processed = 0;
  var hasMore = false;

  for (var i = 0; i < files.length; i++) {
    var file = files[i];

    if (!isCommandJsonFile(file)) continue;

    // Skip already processed commands
    if (AEMCP.processedCommands[file.name]) continue;

    if (processed >= 1) {
      hasMore = true;
      break;
    }

    try {
      processed += processCommandFile(file);
    } catch (e) {
      // Log error but continue processing
      $.writeln("Error processing " + file.name + ": " + e.toString());
    }
  }

  return JSON.stringify({ processed: processed, hasMore: hasMore });
}

/**
 * Process a single command file
 */
function processCommandFile(file) {
  // Read the command file
  file.open("r");
  var content = file.read();
  file.close();

  // Parse JSON
  var command;
  try {
    command = JSON.parse(content);
  } catch (e) {
    writeErrorResponse(file, "Invalid JSON: " + e.toString());
    markAsProcessed(file);
    return 1;
  }

  // Validate command structure
  if (!command.id || !command.script) {
    writeErrorResponse(file, "Invalid command structure: missing id or script");
    markAsProcessed(file);
    return 1;
  }

  // Reentrancy guard: the CEP panel polls processCommands() every 100ms
  // via an async evalScript() call, without waiting for the previous poll
  // to finish. ExtendScript itself is single-threaded so true overlap is
  // rare, but if a previous command is still inside a blocking dialog
  // (see below) when a poll fires, we must not open a second, nested
  // undo group on top of one that hasn't closed yet - that is exactly
  // what corrupts AE's undo stack ("取り消しのグループが一致しません").
  if (AEMCP.commandInProgress) {
    return 0;
  }
  AEMCP.commandInProgress = true;

  try {
    var result;
    try {
      result = runCommandScript(command.script, "AE-MCP: " + command.id);
    } catch (e) {
      writeErrorResponse(file, e.toString());
      markAsProcessed(file);
      return 1;
    }

    // Response failures must not enter the script/undo cleanup path again.
    writeSuccessResponse(file, result);
    markAsProcessed(file);
    return 1;
  } finally {
    AEMCP.commandInProgress = false;
  }
}

/**
 * Keep script declarations out of the caller's cleanup and file variables.
 */
function evaluateCommandScript(script) {
  return eval(script);
}

/**
 * Close each successfully opened scope once, including on execution errors.
 * Dialog cleanup must still run if closing the undo group throws.
 */
function runCommandScript(script, undoName) {
  var dialogsSuppressed = false;
  var undoGroupStarted = false;
  try {
    app.beginSuppressDialogs();
    dialogsSuppressed = true;
    app.beginUndoGroup(undoName);
    undoGroupStarted = true;
    return evaluateCommandScript(script);
  } finally {
    try {
      if (undoGroupStarted) {
        app.endUndoGroup();
      }
    } finally {
      if (dialogsSuppressed) {
        app.endSuppressDialogs(false);
      }
    }
  }
}

/**
 * Write a response payload atomically via temp file + rename without blocking the AE UI thread.
 */
function writeResponsePayload(commandFile, response) {
  var payload = JSON.stringify(response);
  var responsePath = commandFile.fsName + ".response";
  var responseFile = new File(responsePath);
  var tmpFile = new File(responsePath + ".tmp");

  tmpFile.encoding = "UTF-8";
  if (tmpFile.open("w")) {
    tmpFile.write(payload);
    tmpFile.close();
    if (responseFile.exists) {
      responseFile.remove();
    }
    if (tmpFile.rename(commandFile.name + ".response")) {
      return;
    }
    tmpFile.remove();
  }

  // Fallback if atomic rename fails
  responseFile.encoding = "UTF-8";
  responseFile.open("w");
  responseFile.write(payload);
  responseFile.close();
}

/**
 * Write a success response file
 */
function writeSuccessResponse(commandFile, data) {
  writeResponsePayload(commandFile, {
    success: true,
    data: data,
    commandId: extractCommandId(commandFile.name),
    timestamp: new Date().getTime()
  });
}

/**
 * Write an error response file
 */
function writeErrorResponse(commandFile, error) {
  writeResponsePayload(commandFile, {
    success: false,
    error: error,
    commandId: extractCommandId(commandFile.name),
    timestamp: new Date().getTime()
  });
}

/**
 * Mark a command file as processed and delete it to keep the IPC directory clean.
 */
function markAsProcessed(file) {
  AEMCP.processedCount = (AEMCP.processedCount || 0) + 1;

  if (Object.keys(AEMCP.processedCommands).length > 500) {
    AEMCP.processedCommands = {};
  }
  AEMCP.processedCommands[file.name] = true;

  if (file.remove()) {
    return;
  }

  // Fallback: archive as .processed if immediate deletion fails
  var processedPath = file.fsName + ".processed";
  var processedFile = new File(processedPath);
  if (processedFile.exists) {
    processedFile.remove();
  }
  file.rename(file.name + ".processed");
}

/**
 * Extract command ID from filename
 * Format: {clientPrefix}_{commandId}.json
 */
function extractCommandId(filename) {
  // Remove .json extension
  var baseName = filename.replace(".json", "");
  // Get the part after the last underscore (roughly)
  var parts = baseName.split("_");
  if (parts.length >= 3) {
    return parts.slice(2).join("_");
  }
  return baseName;
}

/**
 * Clean up old processed files
 */
function cleanupProcessedFiles(maxAge) {
  if (!AEMCP.commandsFolder || !AEMCP.commandsFolder.exists) {
    return JSON.stringify({ cleaned: 0 });
  }

  maxAge = maxAge || 3600000; // Default 1 hour
  var now = new Date().getTime();
  var cleaned = 0;

  var files = AEMCP.commandsFolder.getFiles("*.processed");
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var modified = file.modified.getTime();

    if (now - modified > maxAge) {
      file.remove();
      cleaned++;
    }
  }

  // Also clean up response files
  files = AEMCP.commandsFolder.getFiles("*.response");
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var modified = file.modified.getTime();

    if (now - modified > maxAge) {
      file.remove();
      cleaned++;
    }
  }

  return JSON.stringify({ cleaned: cleaned });
}

/**
 * Get MCP status
 */
function getMCPStatus() {
  return JSON.stringify({
    isRunning: AEMCP.isRunning,
    folder: AEMCP.commandsFolder ? AEMCP.commandsFolder.fsName : null,
    processedCount: AEMCP.processedCount || Object.keys(AEMCP.processedCommands).length,
    aeVersion: app.version,
    project: app.project.file ? app.project.file.name : "Untitled"
  });
}

/**
 * Stop the MCP bridge
 */
function stopMCP() {
  AEMCP.isRunning = false;
  AEMCP.processedCommands = {};
  return JSON.stringify({ success: true });
}

/**
 * Execute a script directly (for testing)
 */
function executeScript(script) {
  if (AEMCP.commandInProgress) {
    return JSON.stringify({ success: false, error: "Another AE-MCP command is still in progress" });
  }
  AEMCP.commandInProgress = true;

  try {
    var result = runCommandScript(script, "AE-MCP Direct Execute");
    return JSON.stringify({ success: true, data: result });
  } catch (e) {
    return JSON.stringify({ success: false, error: e.toString() });
  } finally {
    AEMCP.commandInProgress = false;
  }
}

// JSON polyfill for ExtendScript (ES3)
if (typeof JSON === "undefined") {
  JSON = {};
}

if (typeof JSON.parse !== "function") {
  JSON.parse = function(text) {
    return eval("(" + text + ")");
  };
}

if (typeof JSON.stringify !== "function") {
  JSON.stringify = function(value) {
    var type = typeof value;

    if (value === null) {
      return "null";
    }

    if (type === "undefined") {
      return undefined;
    }

    if (type === "number" || type === "boolean") {
      return String(value);
    }

    if (type === "string") {
      return '"' + value.replace(/\\/g, "\\\\")
                        .replace(/"/g, '\\"')
                        .replace(/\n/g, "\\n")
                        .replace(/\r/g, "\\r")
                        .replace(/\t/g, "\\t") + '"';
    }

    if (value instanceof Array) {
      var arr = [];
      for (var i = 0; i < value.length; i++) {
        var v = JSON.stringify(value[i]);
        if (v !== undefined) {
          arr.push(v);
        } else {
          arr.push("null");
        }
      }
      return "[" + arr.join(",") + "]";
    }

    if (type === "object") {
      var pairs = [];
      for (var key in value) {
        if (value.hasOwnProperty(key)) {
          var v = JSON.stringify(value[key]);
          if (v !== undefined) {
            pairs.push('"' + key + '":' + v);
          }
        }
      }
      return "{" + pairs.join(",") + "}";
    }

    return undefined;
  };
}

// Object.keys polyfill for ES3
if (typeof Object.keys !== "function") {
  Object.keys = function(obj) {
    var keys = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        keys.push(key);
      }
    }
    return keys;
  };
}
