/**
 * NativeMediaSource - Media source for OS media session (node-nowplaying)
 *
 * This source captures media playback information from the operating system's
 * media session using the node-nowplaying native module. It wraps the callback-based
 * API into a Promise-based interface and implements the MediaSource strategy.
 */

import { NowPlaying } from "../nowplayingWrapper";
import type { NowPlayingMessage, NowPlaying as NowPlayingType } from "node-nowplaying";
import { saveImage } from "../imageUtils";
import { MediaSource } from "./MediaSource";
import { SongData, SongAbilities } from "@deskthing/types";

/**
 * Native media source using OS media sessions
 */
export class NativeMediaSource extends MediaSource {
  private player: NowPlayingType | null = null;
  private currentMessage: NowPlayingMessage | undefined = undefined;
  private isSubscribed = false;

  /**
   * Initialize the native media source
   * Creates the NowPlaying instance and subscribes to media session events
   */
  async initialize(): Promise<void> {
    if (this.player && this.isSubscribed) {
      return; // Already initialized
    }

    this.player = new NowPlaying(this.handleMessage.bind(this));
    await this.player.subscribe();
    this.isSubscribed = true;
  }

  /**
   * Clean up resources
   * Unsubscribes from media session events
   */
  async dispose(): Promise<void> {
    if (this.player && this.isSubscribed) {
      this.player.unsubscribe();
      this.isSubscribed = false;
    }
    this.player = null;
    this.currentMessage = undefined;
  }

  /**
   * Get the current song data from the latest received message
   */
  async getCurrentSong(): Promise<SongData | null> {
    if (!this.currentMessage) {
      return null;
    }
    return this.parseMessageToSongData(this.currentMessage);
  }

  // ========== Standard Playback Controls ==========

  /**
   * Resume playback
   */
  async play(): Promise<void> {
    if (!this.player) {
      throw new Error("NativeMediaSource not initialized");
    }
    this.player.play();
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    if (!this.player) {
      throw new Error("NativeMediaSource not initialized");
    }
    this.player.pause();
  }

  /**
   * Skip to the next track
   */
  async next(): Promise<void> {
    if (!this.player) {
      throw new Error("NativeMediaSource not initialized");
    }
    this.player.nextTrack();
  }

  /**
   * Go to the previous track
   */
  async previous(): Promise<void> {
    if (!this.player) {
      throw new Error("NativeMediaSource not initialized");
    }
    this.player.previousTrack();
  }

  /**
   * Seek to a specific position in the current track
   */
  async seek(positionMs: number): Promise<void> {
    if (!this.player) {
      throw new Error("NativeMediaSource not initialized");
    }
    this.player.seekTo(positionMs);
  }

  /**
   * Set the playback volume
   */
  async setVolume(volume: number): Promise<void> {
    if (!this.player) {
      throw new Error("NativeMediaSource not initialized");
    }
    this.player.setVolume(volume);
  }

  // ========== Extended Controls ==========

  /**
   * Set shuffle mode
   * Note: OS media sessions do not provide consistent shuffle control
   */
  async setShuffle(shuffle: boolean): Promise<void> {
    if (!this.player) {
      throw new Error("NativeMediaSource not initialized");
    }
    // The native module has setShuffle, but it may not work consistently
    this.player.setShuffle(shuffle);
    console.warn(`NativeMediaSource: setShuffle(${shuffle}) called - may not be supported by all apps`);
  }

  /**
   * Set repeat mode
   * Note: OS media sessions do not provide consistent repeat control
   */
  async setRepeat(repeat: "off" | "all" | "track"): Promise<void> {
    // The native module does not have setRepeat - this is a no-op
    console.warn(`NativeMediaSource: setRepeat(${repeat}) called - not supported by OS media sessions`);
  }

  /**
   * Set rating/like status for the current track
   * Note: OS media sessions do not provide rating control
   */
  async setRating(rating: number): Promise<void> {
    // The native module does not have setRating - this is a no-op
    console.warn(`NativeMediaSource: setRating(${rating}) called - not supported by OS media sessions`);
  }

  // ========== Capabilities ==========

  /**
   * Get the supported abilities based on current media state
   */
  getAbilities(): SongAbilities[] {
    if (!this.currentMessage) {
      return [];
    }
    return this.getAbilitiesFromMessage(this.currentMessage);
  }

  /**
   * Extended controls (shuffle, repeat, rating) are not consistently supported
   */
  supportsExtendedControls(): boolean {
    return false;
  }

  // ========== Status ==========

  /**
   * Check if connected to the media session
   */
  isConnected(): boolean {
    return this.player !== null && this.isSubscribed;
  }

  /**
   * Get the human-readable name of this source
   */
  getSourceName(): string {
    return "Native";
  }

  // ========== Private Methods ==========

  /**
   * Handle incoming messages from the NowPlaying native module
   * Downloads thumbnails and notifies listeners of song changes
   */
  private async handleMessage(message: NowPlayingMessage): Promise<void> {
    // Download and save thumbnail if present
    if (message.thumbnail) {
      const sanitizedFileName = (message.id || `${message.trackName}-${message.artist}`).replace(
        /[<>:"/\\|?*]/g,
        "_"
      );
      message.thumbnail = await saveImage(message.thumbnail, sanitizedFileName);
    }

    this.currentMessage = message;
    const songData = this.parseMessageToSongData(message);
    this.notifySongChange(songData);
  }

  /**
   * Parse a NowPlayingMessage into SongData format
   */
  private parseMessageToSongData(message: NowPlayingMessage): SongData {
    /**
     * Checks if the current track duration is extremely long (over 8 hours).
     * Used to identify potentially problematic track durations (nanoseconds vs milliseconds).
     */
    const isNano = message.trackDuration && message.trackDuration > 18000000; // 8 hours threshold

    return {
      version: 2,
      album: message.album || null,
      artist: message.artist?.[0] || null,
      playlist: message.playlist || null,
      playlist_id: message.playlistId || null,
      track_name: message.trackName,
      shuffle_state: message.shuffleState || null,
      repeat_state: (message.repeatState as "off" | "all" | "track") || "off",
      is_playing: message.isPlaying,
      abilities: this.getAbilitiesFromMessage(message),
      track_duration:
        message.trackDuration && isNano
          ? this.nanoToMilli(message.trackDuration)
          : message.trackDuration || null,
      track_progress:
        message.trackProgress && isNano
          ? this.nanoToMilli(message.trackProgress)
          : message.trackProgress || null,
      volume: message.volume,
      thumbnail: message.thumbnail || null,
      device: message.device || null,
      id: message.id || null,
      device_id: message.deviceId || null,
      source: "local",
    };
  }

  /**
   * Extract abilities from a NowPlayingMessage
   */
  private getAbilitiesFromMessage(data: NowPlayingMessage): SongAbilities[] {
    const abilities: SongAbilities[] = [];
    if (data.canFastForward) {
      abilities.push(SongAbilities.FAST_FORWARD);
    }
    if (data.canLike) {
      abilities.push(SongAbilities.LIKE);
    }
    if (data.canSkip) {
      abilities.push(SongAbilities.NEXT);
    }
    if (data.canChangeVolume) {
      abilities.push(SongAbilities.CHANGE_VOLUME);
    }
    if (data.canSetOutput) {
      abilities.push(SongAbilities.SET_OUTPUT);
    }
    return abilities;
  }

  /**
   * Convert nanoseconds to milliseconds
   */
  private nanoToMilli(nano: number): number {
    return nano / 10000;
  }
}
