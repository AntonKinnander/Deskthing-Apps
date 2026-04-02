/**
 * MediaSource - Abstract interface for media capture sources
 *
 * This interface defines the contract that both NativeMediaSource (OS media session)
 * and WebNowPlayingSource (browser extension) will implement, following the
 * Strategy pattern for flexible media source management.
 */

import { SongData, SongAbilities } from "@deskthing/types";

/**
 * Callback type for song change events
 */
export type SongChangeCallback = (song: SongData | null) => void;

/**
 * Callback type for disconnect events
 */
export type DisconnectCallback = () => void;

/**
 * Abstract base class/interface for media sources
 *
 * Implementations must provide:
 * - Lifecycle management (initialize, dispose)
 * - Data retrieval (getCurrentSong)
 * - Standard playback controls (play, pause, next, previous, seek, setVolume)
 * - Extended controls (setShuffle, setRepeat, setRating) - may be no-ops for unsupported features
 * - Capabilities query (getAbilities, supportsExtendedControls)
 * - Event handling (onSongChange, onDisconnect)
 * - Status methods (isConnected, getSourceName)
 */
export abstract class MediaSource {
  /**
   * Callback invoked when song data changes
   */
  protected _onSongChangeCallback: SongChangeCallback | null = null;

  /**
   * Callback invoked when the source disconnects
   */
  protected _onDisconnectCallback: DisconnectCallback | null = null;

  /**
   * Initialize the media source
   * Should set up any necessary connections, subscriptions, or listeners
   */
  abstract initialize(): Promise<void>;

  /**
   * Clean up resources
   * Should unsubscribe, disconnect, and release any held resources
   */
  abstract dispose(): Promise<void>;

  /**
   * Get the current song data
   * @returns Current song data, or null if no song is available
   */
  abstract getCurrentSong(): Promise<SongData | null>;

  // ========== Standard Playback Controls ==========

  /**
   * Resume playback
   */
  abstract play(): Promise<void>;

  /**
   * Pause playback
   */
  abstract pause(): Promise<void>;

  /**
   * Skip to the next track
   */
  abstract next(): Promise<void>;

  /**
   * Go to the previous track
   */
  abstract previous(): Promise<void>;

  /**
   * Seek to a specific position in the current track
   * @param positionMs - Target position in milliseconds
   */
  abstract seek(positionMs: number): Promise<void>;

  /**
   * Set the playback volume
   * @param volume - Volume level (0-100)
   */
  abstract setVolume(volume: number): Promise<void>;

  // ========== Extended Controls ==========

  /**
   * Set shuffle mode
   * Note: Native OS media sessions may not support this consistently
   * @param shuffle - True to enable shuffle, false to disable
   */
  abstract setShuffle(shuffle: boolean): Promise<void>;

  /**
   * Set repeat mode
   * Note: Native OS media sessions may not support this consistently
   * @param repeat - Repeat mode: "off", "all", or "track"
   */
  abstract setRepeat(repeat: "off" | "all" | "track"): Promise<void>;

  /**
   * Set rating/like status for the current track
   * Note: Native OS media sessions typically do not support this
   * @param rating - Rating value (implementation-specific, e.g., 0-5 or boolean)
   */
  abstract setRating(rating: number): Promise<void>;

  // ========== Capabilities ==========

  /**
   * Get the supported abilities for this media source
   * @returns Array of supported SongAbilities
   */
  abstract getAbilities(): SongAbilities[];

  /**
   * Check if this source supports extended controls (shuffle, repeat, rating)
   * @returns True if extended controls are fully functional
   */
  abstract supportsExtendedControls(): boolean;

  // ========== Event Handling ==========

  /**
   * Register a callback for song change events
   * @param callback - Function to call when song data changes
   */
  onSongChange(callback: SongChangeCallback): void {
    this._onSongChangeCallback = callback;
  }

  /**
   * Register a callback for disconnect events
   * @param callback - Function to call when the source disconnects
   */
  onDisconnect(callback: DisconnectCallback): void {
    this._onDisconnectCallback = callback;
  }

  /**
   * Protected method to notify listeners of song changes
   * Implementations should call this when song data is updated
   */
  protected notifySongChange(song: SongData | null): void {
    if (this._onSongChangeCallback) {
      this._onSongChangeCallback(song);
    }
  }

  /**
   * Protected method to notify listeners of disconnection
   * Implementations should call this when disconnected
   */
  protected notifyDisconnect(): void {
    if (this._onDisconnectCallback) {
      this._onDisconnectCallback();
    }
  }

  // ========== Status ==========

  /**
   * Check if the media source is currently connected and active
   * @returns True if connected and operational
   */
  abstract isConnected(): boolean;

  /**
   * Get the human-readable name of this media source
   * @returns Source name (e.g., "Native", "WebNowPlaying")
   */
  abstract getSourceName(): string;
}
