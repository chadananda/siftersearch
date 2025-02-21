// Global configuration manager for Sifter Search

class ConfigManager {
  constructor() {
    this._libraryId = 'ocean'; // Default to 'ocean'
    this._settings = new Map();
    this._initialized = false;
  }

  // Check if the configuration is properly initialized
  get isInitialized() {
    return this._initialized;
  }

  // Initialize configuration with database connection
  async initialize() {
    if (this._initialized) return;
    
    try {
      // Perform any necessary initialization here
      this._initialized = true;
    } catch (error) {
      console.error('Failed to initialize config:', error);
      throw error;
    }
  }

  // Library ID management
  get libraryId() {
    return this._libraryId;
  }

  // For testing purposes only
  setLibraryId(id) {
    if (!id) throw new Error('libraryId cannot be empty');
    this._libraryId = id;
  }

  // Automatically determine libraryId from subdomain
  setLibraryIdFromRequest(req) {
    if (!req || !req.hostname) return;
    const subdomain = req.hostname.split('.')[0];
    if (subdomain && subdomain !== 'www') {
      this._libraryId = subdomain;
    }
  }

  // General settings management
  setSetting(key, value) {
    this._settings.set(key, value);
  }

  getSetting(key) {
    return this._settings.get(key);
  }

  clearSetting(key) {
    this._settings.delete(key);
  }

  clearAllSettings() {
    this._settings.clear();
    this._libraryId = null;
  }
}

// Create and export a singleton instance
const configInstance = new ConfigManager();

// Prevent modifications to the config instance
Object.freeze(configInstance);

export default configInstance;