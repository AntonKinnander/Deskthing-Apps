/**
 * WebNowPlayingSource - Media source for WebNowPlaying browser extension
 *
 * This source captures media playback information from the WebNowPlaying
 * WebSocket server (ws://localhost:6534). It implements the WNP protocol
 * which provides rich metadata and control capabilities from web players.
 */

import * as WebSocket from 'ws';
import { MediaSource } from './MediaSource';
import { SongData, SongAbilities } from '@deskthing/types';
import { saveImage } from '../imageUtils';

/**
 * JSON data format received from WebNowPlaying
 */
interface WNPData {
  state: 'PLAYING' | 'PAUSED';
  player_name: string;
  title: string;
  artist: string;
  album: string;
  cover_url: string;
  duration: string; // "MM:SS" format
  duration_seconds: number;
  position: string; // "MM:SS" format
  position_seconds: number;
  position_percent: number;
  volume: number;
  rating: number;
  repeat_mode: 'NONE' | 'ALL' | 'ONE';
  shuffle_active: boolean;
  timestamp: number;
}

/**
 * Control event format sent to WebNowPlaying
 */
interface WNPControlEvent {
  event: 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'volume' | 'shuffle' | 'repeat' | 'like' | 'rate';
  value?: number | string | boolean;
}

/**
 * WebNowPlaying media source using WebSocket connection
 */
export class WebNowPlayingSource extends MediaSource {
  private static readonly WNP_URL = 'ws://localhost:6534';
  private static readonly CONNECTION_TIMEOUT_MS = 5000;
  private static readonly INITIAL_RECONNECT_DELAY_MS = 1000;
  private static readonly MAX_RECONNECT_DELAY_MS = 30000;

  private ws: WebSocket.WebSocket | null = null;
  private _isConnected = false;
  private isDisposed = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private currentReconnectDelay: number = WebNowPlayingSource.INITIAL_RECONNECT_DELAY_MS;

  // Cache the latest song data
  private currentSongData: SongData | null = null;

  /**
   * Initialize the WebNowPlaying source
   * Connects to the WebSocket server and sets up message handlers
   */
  async initialize(): Promise<void> {
    if (this.ws && this._isConnected) {
      return; // Already initialized
    }

    await this.connect();
  }

  /**
   * Connect to the WebNowPlaying WebSocket server
   */
  private async connect(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WebNowPlayingSource.WNP_URL);

        // Set up connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            console.error('WebNowPlaying: Connection timeout');
            this.scheduleReconnect();
            reject(new Error('Connection timeout'));
          }
        }, WebNowPlayingSource.CONNECTION_TIMEOUT_MS);

        this.ws.on('open', async () => {
          if (this.isDisposed) {
            this.cleanup();
            return;
          }

          this.clearConnectionTimeout();
          this._isConnected = true;
          this.currentReconnectDelay = WebNowPlayingSource.INITIAL_RECONNECT_DELAY_MS;

          console.log('WebNowPlaying: Connected');

          // Send handshake
          try {
            this.ws?.send('RECIPIENT');
            resolve();
          } catch (error) {
            console.error('WebNowPlaying: Failed to send handshake:', error);
            reject(error);
          }
        });

        this.ws.on('message', async (data: WebSocket.Data) => {
          await this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('WebNowPlaying: WebSocket error:', error.message);
        });

        this.ws.on('close', () => {
          this._isConnected = false;
          console.log('WebNowPlaying: Disconnected');
          this.notifyDisconnect();
          this.scheduleReconnect();
        });
      } catch (error) {
        console.error('WebNowPlaying: Failed to create WebSocket:', error);
        this.scheduleReconnect();
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages from WebNowPlaying
   */
  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const message = data.toString();
      const wnpData: WNPData = JSON.parse(message);

      // Download and save cover art if present
      let thumbnailUrl: string | null = null;
      if (wnpData.cover_url) {
        const sanitizedFileName = `${wnpData.player_name}-${wnpData.title}-${wnpData.artist}`.replace(
          /[<>:"/\\|?*]/g,
          '_'
        );
        thumbnailUrl = await saveImage(wnpData.cover_url, sanitizedFileName) || null;
      }

      // Transform WNP data to SongData
      this.currentSongData = this.parseWNPDataToSongData(wnpData, thumbnailUrl);
      this.notifySongChange(this.currentSongData);
    } catch (error) {
      console.error('WebNowPlaying: Failed to parse message:', error);
    }
  }

  /**
   * Parse WNP data format to SongData
   */
  private parseWNPDataToSongData(wnpData: WNPData, thumbnailUrl: string | null): SongData {
    return {
      version: 2,
      album: wnpData.album || null,
      artist: wnpData.artist || null,
      playlist: null,
      playlist_id: null,
      track_name: wnpData.title || 'Unknown Track',
      shuffle_state: wnpData.shuffle_active || null,
      repeat_state: this.mapRepeatMode(wnpData.repeat_mode),
      is_playing: wnpData.state === 'PLAYING',
      abilities: this.getWNPAbilities(),
      track_duration: wnpData.duration_seconds * 1000, // Convert to ms
      track_progress: wnpData.position_seconds * 1000, // Convert to ms
      volume: wnpData.volume || 0,
      thumbnail: thumbnailUrl,
      device: wnpData.player_name || null,
      id: null,
      device_id: null,
      source: 'WebNowPlaying',
    };
  }

  /**
   * Map WNP repeat mode to DeskThing format
   */
  private mapRepeatMode(wnpMode: 'NONE' | 'ALL' | 'ONE'): 'off' | 'all' | 'track' {
    switch (wnpMode) {
      case 'NONE':
        return 'off';
      case 'ALL':
        return 'all';
      case 'ONE':
        return 'track';
      default:
        return 'off';
    }
  }

  /**
   * Map DeskThing repeat mode to WNP format
   */
  private mapToWNPRepeatMode(mode: 'off' | 'all' | 'track'): 'OFF' | 'ALL' | 'ONE' {
    switch (mode) {
      case 'off':
        return 'OFF';
      case 'all':
        return 'ALL';
      case 'track':
        return 'ONE';
      default:
        return 'OFF';
    }
  }

  /**
   * Get the supported WNP abilities
   */
  private getWNPAbilities(): SongAbilities[] {
    return [
      SongAbilities.FAST_FORWARD,
      SongAbilities.NEXT,
      SongAbilities.PREVIOUS,
      SongAbilities.CHANGE_VOLUME,
      SongAbilities.SHUFFLE,
      SongAbilities.REPEAT,
      SongAbilities.LIKE,
    ];
  }

  /**
   * Send a control event to WebNowPlaying
   */
  private sendControlEvent(event: WNPControlEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebNowPlaying: Not connected'));
        return;
      }

      try {
        this.ws.send(JSON.stringify(event));
        resolve();
      } catch (error) {
        console.error('WebNowPlaying: Failed to send control event:', error);
        reject(error);
      }
    });
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isDisposed || this.reconnectTimeout) {
      return;
    }

    console.log(`WebNowPlaying: Scheduling reconnect in ${this.currentReconnectDelay}ms`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;

      if (!this.isDisposed) {
        try {
          await this.connect();
        } catch (error) {
          // Error already logged in connect()
        }
      }
    }, this.currentReconnectDelay);

    // Exponential backoff: double the delay for next attempt, up to max
    this.currentReconnectDelay = Math.min(
      this.currentReconnectDelay * 2,
      WebNowPlayingSource.MAX_RECONNECT_DELAY_MS
    );
  }

  /**
   * Clear the connection timeout
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Clean up WebSocket resources
   */
  private cleanup(): void {
    this.clearConnectionTimeout();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Dispose of the media source
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;
    this.cleanup();
    this.currentSongData = null;
  }

  /**
   * Get the current song data
   */
  async getCurrentSong(): Promise<SongData | null> {
    return this.currentSongData;
  }

  // ========== Standard Playback Controls ==========

  /**
   * Resume playback
   */
  async play(): Promise<void> {
    await this.sendControlEvent({ event: 'play' });
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    await this.sendControlEvent({ event: 'pause' });
  }

  /**
   * Skip to the next track
   */
  async next(): Promise<void> {
    await this.sendControlEvent({ event: 'next' });
  }

  /**
   * Go to the previous track
   */
  async previous(): Promise<void> {
    await this.sendControlEvent({ event: 'prev' });
  }

  /**
   * Seek to a specific position in the current track
   * @param positionMs - Target position in milliseconds
   */
  async seek(positionMs: number): Promise<void> {
    // Convert milliseconds to seconds for WNP
    await this.sendControlEvent({ event: 'seek', value: Math.floor(positionMs / 1000) });
  }

  /**
   * Set the playback volume
   * @param volume - Volume level (0-100)
   */
  async setVolume(volume: number): Promise<void> {
    await this.sendControlEvent({ event: 'volume', value: Math.max(0, Math.min(100, volume)) });
  }

  // ========== Extended Controls ==========

  /**
   * Set shuffle mode
   * @param shuffle - True to enable shuffle, false to disable
   */
  async setShuffle(shuffle: boolean): Promise<void> {
    await this.sendControlEvent({ event: 'shuffle', value: shuffle });
  }

  /**
   * Set repeat mode
   * @param repeat - Repeat mode: "off", "all", or "track"
   */
  async setRepeat(repeat: 'off' | 'all' | 'track'): Promise<void> {
    await this.sendControlEvent({ event: 'repeat', value: this.mapToWNPRepeatMode(repeat) });
  }

  /**
   * Set rating/like status for the current track
   * @param rating - Rating value (0-5)
   */
  async setRating(rating: number): Promise<void> {
    const clampedRating = Math.max(0, Math.min(5, Math.round(rating)));
    await this.sendControlEvent({ event: 'rate', value: clampedRating });
  }

  // ========== Capabilities ==========

  /**
   * Get the supported abilities for this media source
   */
  getAbilities(): SongAbilities[] {
    return this.getWNPAbilities();
  }

  /**
   * Check if this source supports extended controls
   */
  supportsExtendedControls(): boolean {
    return true;
  }

  // ========== Status ==========

  /**
   * Check if connected to the WebNowPlaying server
   */
  isConnectedStatus(): boolean {
    return this._isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if the media source is currently connected and active
   */
  isConnected(): boolean {
    return this.isConnectedStatus();
  }

  /**
   * Get the human-readable name of this media source
   */
  getSourceName(): string {
    return 'WebNowPlaying';
  }
}
