// --- MASTER DEBUG SWITCH ---
// Set this to true to see all debug messages in the console.
// Set this to false to hide all debug messages for production.
const DEBUG_MODE = false;

/**
 * A conditional logger that only prints to the console if DEBUG_MODE is true.
 * This acts as a global switch for all debug logging.
 * @param message The primary message or object to log.
 * @param optionalParams Any additional parameters, including CSS for styling.
 */
export const debugLog = (message?: any, ...optionalParams: any[]): void => {
  if (DEBUG_MODE) {
    console.log(message, ...optionalParams);
  }
};
