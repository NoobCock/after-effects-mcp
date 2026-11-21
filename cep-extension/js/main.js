/**
 * AE-MCP CEP Panel JavaScript
 *
 * Manages the CEP panel UI and communication with the host script.
 * Uses CEP's Node.js fs API in CEPHtmlEngine to watch for pending commands so
 * After Effects' main Win32 UI thread receives zero evalScript calls while idle.
 */

// Node fs handle inside CEP (--enable-nodejs + --mixed-context)
let nodeFs = null;
try {
  const nodeRequire = (typeof cep_node !== 'undefined' && cep_node && cep_node.require)
    ? cep_node.require
    : (typeof require === 'function' ? require : null);
  if (nodeRequire) {
    nodeFs = nodeRequire('fs');
  }
} catch (e) {
  nodeFs = null;
}

const POLL_INTERVAL_MS = 150;
const FALLBACK_POLL_INTERVAL_MS = 500;
const COMMAND_COOLDOWN_MS = 80;
const EVAL_SAFETY_TIMEOUT_MS = 70000;

// CSInterface instance and bridge state
let csInterface;
let pollInterval = null;
let isRunning = false;
let evalInFlight = false;
let checkInFlight = false;
let cooldownUntil = 0;
let lastFallbackPoll = 0;
let commandsFolder = null;
let processedTotal = 0;
let hostInfo = {
  aeVersion: 'Unknown',
  project: 'Untitled',
  folder: null
};
let statusElement;
let logElement;

/**
 * Check whether a filename is a pending .json command file
 */
function isPendingCommandFilename(name) {
  return typeof name === 'string' &&
    name.length > 5 &&
    name.slice(-5).toLowerCase() === '.json';
}

/**
 * Evaluate a script in the host with an exclusive in-flight lock
 */
function runEvalScript(script, callback) {
  evalInFlight = true;
  let settled = false;
  const safetyTimer = setTimeout(() => {
    if (!settled) {
      settled = true;
      evalInFlight = false;
      log('Host evalScript timed out; releasing bridge lock');
      if (callback) callback('');
    }
  }, EVAL_SAFETY_TIMEOUT_MS);

  evalScript(script, (result) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(safetyTimer);
    evalInFlight = false;
    if (callback) {
      callback(result);
    }
  });
}

/**
 * Render status from cached host info without hitting the AE main thread
 */
function renderStatus() {
  if (!statusElement) {
    return;
  }
  let statusText = '';
  statusText += 'Status: ' + (isRunning ? 'Running' : 'Stopped') + '\n';
  statusText += 'AE Version: ' + (hostInfo.aeVersion || 'Unknown') + '\n';
  statusText += 'Project: ' + (hostInfo.project || 'Untitled') + '\n';
  statusText += 'Commands Processed: ' + processedTotal;
  if (nodeFs && commandsFolder) {
    statusText += '\nWatch Mode: Node fs (idle 0 IPC)';
  }
  statusElement.textContent = statusText;
}

/**
 * Initialize the panel
 */
function init() {
  csInterface = new CSInterface();

  // Get DOM elements
  statusElement = document.getElementById('status');
  logElement = document.getElementById('log');

  // Set up event listeners and blur buttons so keyboard focus returns to AE
  document.getElementById('startBtn').addEventListener('click', (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    startMCP();
  });
  document.getElementById('stopBtn').addEventListener('click', (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    stopMCP();
  });
  document.getElementById('cleanupBtn').addEventListener('click', (e) => {
    if (e && e.currentTarget) e.currentTarget.blur();
    cleanup();
  });

  // Initialize the host script once on load
  runEvalScript('initMCP()', (result) => {
    try {
      const data = JSON.parse(result);
      if (data.success) {
        commandsFolder = data.folder || null;
        hostInfo.folder = commandsFolder;
        log('MCP initialized. Folder: ' + data.folder);
        startPolling();
        updateStatus();
      } else {
        log('Failed to initialize MCP');
      }
    } catch (e) {
      log('Error parsing init result: ' + e);
    }
  });

  log('AE-MCP Panel loaded');
}

/**
 * Start the MCP bridge
 */
function startMCP() {
  if (isRunning) {
    log('MCP is already running');
    return;
  }
  if (evalInFlight) {
    log('Host is busy, please try again');
    return;
  }

  runEvalScript('initMCP()', (result) => {
    try {
      const data = JSON.parse(result);
      if (data.success) {
        commandsFolder = data.folder || commandsFolder;
        hostInfo.folder = commandsFolder;
        log('MCP started');
        startPolling();
        updateStatus();
      }
    } catch (e) {
      log('Error starting MCP: ' + e);
    }
  });
}

/**
 * Stop the MCP bridge
 */
function stopMCP() {
  if (!isRunning) {
    log('MCP is not running');
    return;
  }

  stopPolling();

  if (evalInFlight) {
    log('MCP stopped (host finishing current call)');
    renderStatus();
    return;
  }

  runEvalScript('stopMCP()', () => {
    log('MCP stopped');
    updateStatus();
  });
}

/**
 * Execute one batch in AE and apply a short Win32 message-loop cooldown
 */
function triggerProcessCommands() {
  if (!isRunning || evalInFlight) {
    return;
  }

  runEvalScript('processCommands()', (result) => {
    cooldownUntil = Date.now() + COMMAND_COOLDOWN_MS;
    try {
      const data = JSON.parse(result);
      if (data && data.processed > 0) {
        processedTotal += data.processed;
        renderStatus();
        log('Processed ' + data.processed + ' command(s)');
      }
    } catch (e) {
      // Ignore parse errors during polling
    }
  });
}

/**
 * Periodic check inside CEPHtmlEngine; invokes AE only when a command file exists
 */
function pollTick() {
  const now = Date.now();
  if (!isRunning || evalInFlight || checkInFlight || now < cooldownUntil) {
    return;
  }

  if (nodeFs && commandsFolder) {
    checkInFlight = true;
    nodeFs.readdir(commandsFolder, (err, names) => {
      checkInFlight = false;
      if (!isRunning || evalInFlight || Date.now() < cooldownUntil) {
        return;
      }
      if (err) {
        return;
      }
      if (!Array.isArray(names) || !names.some(isPendingCommandFilename)) {
        return;
      }
      triggerProcessCommands();
    });
  } else {
    if (now - lastFallbackPoll < FALLBACK_POLL_INTERVAL_MS) {
      return;
    }
    lastFallbackPoll = now;
    triggerProcessCommands();
  }
}

/**
 * Start polling for commands
 */
function startPolling() {
  if (pollInterval) {
    return;
  }

  isRunning = true;
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;

  pollInterval = setInterval(pollTick, POLL_INTERVAL_MS);

  log('Started watching for commands' + (nodeFs && commandsFolder ? ' (Node fs mode)' : ''));
  renderStatus();
}

/**
 * Stop polling for commands
 */
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  isRunning = false;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;

  log('Stopped polling');
  renderStatus();
}

/**
 * Clean up old files
 */
function cleanup() {
  if (evalInFlight) {
    log('Host is busy, skipping cleanup');
    return;
  }
  runEvalScript('cleanupProcessedFiles()', (result) => {
    try {
      const data = JSON.parse(result);
      log('Cleaned up ' + data.cleaned + ' old file(s)');
    } catch (e) {
      log('Error during cleanup: ' + e);
    }
  });
}

/**
 * Update status display from host (called only on lifecycle events, never on a timer)
 */
function updateStatus() {
  if (evalInFlight) {
    renderStatus();
    return;
  }
  runEvalScript('getMCPStatus()', (result) => {
    try {
      const data = JSON.parse(result);
      hostInfo.aeVersion = data.aeVersion || hostInfo.aeVersion;
      hostInfo.project = data.project || hostInfo.project;
      hostInfo.folder = data.folder || hostInfo.folder;
      if (data.folder) {
        commandsFolder = data.folder;
      }
      if (typeof data.processedCount === 'number' && data.processedCount > processedTotal) {
        processedTotal = data.processedCount;
      }
      renderStatus();
    } catch (e) {
      if (statusElement) {
        statusElement.textContent = 'Error getting status';
      }
    }
  });
}

/**
 * Add a log entry
 */
function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = '[' + timestamp + '] ' + message + '\n';

  logElement.textContent += entry;

  // Auto-scroll to bottom
  logElement.scrollTop = logElement.scrollHeight;

  // Limit log size
  const lines = logElement.textContent.split('\n');
  if (lines.length > 100) {
    logElement.textContent = lines.slice(-100).join('\n');
  }
}

/**
 * Evaluate a script in the host
 */
function evalScript(script, callback) {
  csInterface.evalScript(script, callback || function() {});
}

/**
 * Persist panel state
 */
function persistState() {
  const state = {
    isRunning: isRunning
  };
  csInterface.setPersistentData('aemcp_state', JSON.stringify(state));
}

/**
 * Restore panel state
 */
function restoreState() {
  const stateStr = csInterface.getPersistentData('aemcp_state');
  if (stateStr) {
    try {
      const state = JSON.parse(stateStr);
      if (state.isRunning) {
        startMCP();
      }
    } catch (e) {
      // Ignore
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  init();
});

// Handle panel close
window.addEventListener('beforeunload', () => {
  persistState();
  stopPolling();
});
