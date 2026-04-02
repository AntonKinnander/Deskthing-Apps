import { DeskThing } from "@deskthing/server"
import { SongAbilities, SongData } from "@deskthing/types";
import { MediaSource } from "./mediaSources/MediaSource";
import { NativeMediaSource } from "./mediaSources/NativeMediaSource";

type MediaType = 'auto' | 'native' | 'wnp';

// Stub for WebNowPlayingSource (to be implemented in Task 2)
interface WebNowPlayingSourceStub extends MediaSource {
  // Placeholder interface - will be replaced by actual implementation
}

export class MediaStore {
  private static instance: MediaStore;

  // Media source abstraction
  private currentSource: MediaSource;
  private nativeSource: NativeMediaSource;
  private wnpSource: WebNowPlayingSourceStub | null = null;

  // Fallback settings
  private fallbackToNative: boolean = true;

  // Store callback cleanup functions to prevent memory leaks
  private songChangeCleanup: (() => void) | null = null;
  private disconnectCleanup: (() => void) | null = null;

  private constructor() {
    this.nativeSource = new NativeMediaSource();
    this.currentSource = this.nativeSource;
    this.setupSourceCallbacks();
  }

  /**
   * Setup callbacks for the current media source
   * Stores cleanup functions to allow proper callback removal
   */
  private setupSourceCallbacks(): void {
    // Clean up old callbacks if they exist
    this.clearSourceCallbacks();

    // Set up new callbacks and store their cleanup functions
    this.songChangeCleanup = this.currentSource.onSongChange((song) => {
      if (song) {
        DeskThing.sendSong(song);
      }
    });

    this.disconnectCleanup = this.currentSource.onDisconnect(() => {
      console.log('MediaSource disconnected:', this.currentSource.getSourceName());
      // Fallback logic: if WNP disconnects and fallback is enabled, switch to native
      if (this.currentSource.getSourceName() === 'WebNowPlaying' && this.fallbackToNative) {
        console.log('Falling back to native source');
        this.setSource('native').catch(err => {
          console.error('Failed to fallback to native source:', err);
        });
      }
    });
  }

  /**
   * Clear existing callbacks by calling their cleanup functions
   */
  private clearSourceCallbacks(): void {
    if (this.songChangeCleanup) {
      this.songChangeCleanup();
      this.songChangeCleanup = null;
    }
    if (this.disconnectCleanup) {
      this.disconnectCleanup();
      this.disconnectCleanup = null;
    }
  }

  /**
   * Initialize the media store and the current media source
   */
  public initializeListeners = async () => {
    await this.currentSource.initialize();
  }

  /**
   * Auto-select media source based on current settings
   * Reads the media_source setting and calls setSource accordingly
   */
  public async autoSelectSource(): Promise<void> {
    try {
      const settings = await DeskThing.getSettings();
      const sourceType = settings.media_source as MediaType;
      console.log(`Auto-selecting media source: ${sourceType}`);
      await this.setSource(sourceType);
    } catch (error) {
      console.error('Error auto-selecting source:', error);
      // Fallback to native on error
      await this.setSource('native');
    }
  }

  /**
   * Detect if WebNowPlaying browser extension is available
   * Attempts to connect to ws://localhost:6534 with a timeout
   * Uses dynamic import to avoid crash if ws module is not available
   */
  public async detectWNPAvailability(): Promise<boolean> {
    const WNP_PORT = 6534;
    const WNP_HOST = 'localhost';
    const TIMEOUT_MS = 3000;

    try {
      // Dynamically import ws module - returns false if not available
      const wsModule = await import('ws').catch(() => null);
      if (!wsModule) {
        console.log('ws module not available - WebNowPlaying cannot be detected');
        return false;
      }

      return new Promise<boolean>((resolve) => {
        const WebSocket = wsModule.default;
        const socket = new WebSocket(`ws://${WNP_HOST}:${WNP_PORT}`);
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            socket.close();
          }
        };

        socket.on('open', () => {
          console.log('WebNowPlaying detected at ws://localhost:6534');
          cleanup();
          resolve(true);
        });

        socket.on('error', () => {
          // Connection failed - WNP not available
          cleanup();
          resolve(false);
        });

        socket.on('close', () => {
          cleanup();
          if (!resolved) {
            resolve(false);
          }
        });

        // Timeout fallback
        setTimeout(() => {
          if (!resolved) {
            console.log('WebNowPlaying detection timed out');
            cleanup();
            resolve(false);
          }
        }, TIMEOUT_MS);
      });
    } catch (error) {
      console.error('Error detecting WebNowPlaying availability:', error);
      return false;
    }
  }

  /**
   * Set the active media source
   * @param sourceType - 'native' for OS media session, 'wnp' for WebNowPlaying, 'auto' to detect
   */
  public async setSource(sourceType: 'native' | 'wnp' | 'auto'): Promise<void> {
    console.log(`Setting media source to: ${sourceType}`);

    if (sourceType === 'auto') {
      const wnpAvailable = await this.detectWNPAvailability();
      if (wnpAvailable && this.wnpSource) {
        await this.switchToSource(this.wnpSource);
        console.log('Auto-detected: Using WebNowPlaying source');
      } else {
        await this.switchToSource(this.nativeSource);
        console.log('Auto-detected: Using Native source (WNP not available)');
      }
    } else if (sourceType === 'wnp') {
      if (!this.wnpSource) {
        console.warn('WebNowPlaying source not yet implemented. Using native source.');
        await this.switchToSource(this.nativeSource);
      } else {
        await this.switchToSource(this.wnpSource);
      }
    } else {
      // sourceType === 'native'
      await this.switchToSource(this.nativeSource);
    }
  }

  /**
   * Switch to a different media source, handling the transition properly
   */
  private async switchToSource(newSource: MediaSource): Promise<void> {
    if (newSource === this.currentSource) {
      return; // Already using this source
    }

    // Dispose old source if initialized
    try {
      if (this.currentSource.isConnected()) {
        await this.currentSource.dispose();
      }
    } catch (err) {
      console.error('Error disposing previous source:', err);
    }

    // Switch to new source
    this.currentSource = newSource;

    // Setup callbacks for new source
    this.setupSourceCallbacks();

    // Initialize new source
    if (!this.currentSource.isConnected()) {
      await this.currentSource.initialize();
    }

    console.log(`Switched to media source: ${this.currentSource.getSourceName()}`);
  }

  purge = async () => {
    await this.currentSource.dispose();
  }

  stop = async () => {
    await this.currentSource.dispose();
  }

  start = async () => {
    if (!this.currentSource.isConnected()) {
      await this.currentSource.initialize();
    }
  }
  public static getInstance(): MediaStore {
    if (!MediaStore.instance) {
      MediaStore.instance = new MediaStore();
    }
    return MediaStore.instance;
  }

  // ========== Song GET events ==========

  public handleGetSong() {
    this.currentSource.getCurrentSong().then(song => {
      if (song) {
        DeskThing.sendSong(song);
      }
    }).catch(err => {
      console.error('Error getting current song:', err);
    });
  }

  public handleRefresh() {
    this.handleGetSong();
  }

  // ========== Song SET events ==========

  public handleFastForward(data: { amount: number | undefined }) {
    this.currentSource.seek(data.amount || 0).catch(err => {
      console.error('Error seeking forward:', err);
    });
  }

  public handleLike() {
    // Use setRating with value 1 (like) - may not be supported by all sources
    this.currentSource.setRating(1).catch(err => {
      console.error('Error liking song:', err);
    });
  }

  public handleNext() {
    this.currentSource.next().catch(err => {
      console.error('Error skipping to next track:', err);
    });
  }

  public handlePause() {
    this.currentSource.pause().catch(err => {
      console.error('Error pausing playback:', err);
    });
  }

  public handlePlay() {
    this.currentSource.play().catch(err => {
      console.error('Error starting playback:', err);
    });
  }

  public handlePrevious() {
    this.currentSource.previous().catch(err => {
      console.error('Error going to previous track:', err);
    });
  }

  public handleRepeat() {
    console.warn('handleRepeat called without repeat mode - using default "off"');
    this.currentSource.setRepeat('off').catch(err => {
      console.error('Error setting repeat:', err);
    });
  }

  public handleRewind(data: { amount: number | undefined }) {
    this.currentSource.seek(data.amount || 0).catch(err => {
      console.error('Error rewinding:', err);
    });
  }

  public handleSeek(data: { positionMs: number }) {
    this.currentSource.seek(data.positionMs).catch(err => {
      console.error('Error seeking:', err);
    });
  }

  public handleShuffle(data: { shuffle: boolean }) {
    this.currentSource.setShuffle(data.shuffle).catch(err => {
      console.error('Error setting shuffle:', err);
    });
  }

  public handleStop() {
    this.currentSource.pause().catch(err => {
      console.error('Error stopping playback:', err);
    });
  }

  public handleVolume(data: { volume: number }) {
    this.currentSource.setVolume(data.volume).catch(err => {
      console.error('Error setting volume:', err);
    });
  }

  // ========== Additional methods for extended controls ==========

  /**
   * Set repeat mode with specific mode
   */
  public setRepeatMode(mode: "off" | "all" | "track") {
    this.currentSource.setRepeat(mode).catch(err => {
      console.error('Error setting repeat mode:', err);
    });
  }

  /**
   * Set rating (0 = dislike/unlike, 1 = like)
   */
  public setRating(rating: number) {
    this.currentSource.setRating(rating).catch(err => {
      console.error('Error setting rating:', err);
    });
  }

  /**
   * Get the current source name
   */
  public getCurrentSourceName(): string {
    return this.currentSource.getSourceName();
  }

  /**
   * Get supported abilities from current source
   */
  public getAbilities(): SongAbilities[] {
    return this.currentSource.getAbilities();
  }

  /**
   * Check if current source supports extended controls
   */
  public supportsExtendedControls(): boolean {
    return this.currentSource.supportsExtendedControls();
  }

  /**
   * Set whether to fallback to native source on WNP disconnect
   */
  public setFallbackEnabled(enabled: boolean): void {
    this.fallbackToNative = enabled;
  }
}
