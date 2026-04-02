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
  private static readonly HEARTBEAT_INTERVAL_MS = 30000;
  private static readonly HEARTBEAT_TIMEOUT_THRESHOLD_MS = 60000;

  private ws: WebSocket.WebSocket | null = null;
  private _isConnected = false;
  private isInitializing = false;
  private isDisposed = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private heartbeatIntervalId: NodeJS.Timeout | null = null;
  private lastMessageTime: number = Date.now();
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
    if (this.isInitializing) {
      return; // Already initializing
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
    if (this.isInitializing) {
      return;
    }

    this.isInitializing = true;
    console.log('WebNowPlaying: Attempting to connect to', WebNowPlayingSource.WNP_URL);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WebNowPlayingSource.WNP_URL);

        // Set up connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            console.error('WebNowPlaying: ✗ Connection timeout - Make sure the WebNowPlaying browser extension is installed and running!');
            this.scheduleReconnect();
            reject(new Error('Connection timeout'));
          }
        }, WebNowPlayingSource.CONNECTION_TIMEOUT_MS);

        this.ws.on('open', async () => {
          if (this.isDisposed) {
            this.cleanup();
            this.isInitializing = false;
            return;
          }

          this.clearConnectionTimeout();
          this._isConnected = true;
          this.isInitializing = false;
          this.currentReconnectDelay = WebNowPlayingSource.INITIAL_RECONNECT_DELAY_MS;

          console.log('WebNowPlaying: ✓ Connected successfully to browser extension');

          // Start heartbeat monitoring
          this.startHeartbeat();

          // Send handshake
          try {
            console.log('WebNowPlaying: Sending handshake...');
            this.ws?.send('RECIPIENT');
            console.log('WebNowPlaying: ✓ Handshake sent - Waiting for data...');
            resolve();
          } catch (error) {
            console.error('WebNowPlaying: Failed to send handshake:', error);
            this.isInitializing = false;
            reject(error);
          }
        });

        this.ws.on('message', async (data: WebSocket.Data) => {
          await this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('WebNowPlaying: WebSocket error:', error.message);
        });

        this.ws.on('close', (code: number) => {
          this._isConnected = false;
          this.isInitializing = false;

          // Don't reconnect if this was a clean shutdown (code 1000)
          if (code === 1000) {
            console.log('WebNowPlaying: Clean shutdown, not reconnecting');
            this.notifyDisconnect();
            return;
          }

          console.log(`WebNowPlaying: Disconnected (code: ${code})`);
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
    // Update last message time for heartbeat monitoring
    this.lastMessageTime = Date.now();

    try {
      const message = data.toString();
      const wnpData: WNPData = JSON.parse(message);

      // Debug: Log incoming WNP data
      console.log('WebNowPlaying: Received data:', {
        title: wnpData.title,
        artist: wnpData.artist,
        player: wnpData.player_name,
        state: wnpData.state,
        hasCoverUrl: !!wnpData.cover_url,
        coverUrl: wnpData.cover_url?.substring(0, 50) + '...',
        shuffle_active: wnpData.shuffle_active,
        repeat_mode: wnpData.repeat_mode,
        volume: wnpData.volume,
      });

      // Download and save cover art if present - wrap in try-catch to prevent crash
      let thumbnailUrl: string | null = null;
      if (wnpData.cover_url) {
        try {
          const fileNameParts = [wnpData.player_name, wnpData.title, wnpData.artist]
            .filter((part) => part && part.trim().length > 0);
          const sanitizedFileName = (fileNameParts.length > 0 ? fileNameParts.join('-') : 'unknown').replace(
            /[<>:"/\\|?*]/g,
            '_'
          );
          console.log('WebNowPlaying: Downloading cover art from:', wnpData.cover_url);
          thumbnailUrl = await saveImage(wnpData.cover_url, sanitizedFileName) || null;
          console.log('WebNowPlaying: Cover art saved to:', thumbnailUrl);
        } catch (imageError) {
          console.error('WebNowPlaying: Failed to download cover art:', imageError);
          thumbnailUrl = null;
        }
      } else {
        console.log('WebNowPlaying: No cover_url in WNP data');
      }

      // Transform WNP data to SongData
      this.currentSongData = this.parseWNPDataToSongData(wnpData, thumbnailUrl);
      this.notifySongChange(this.currentSongData);
    } catch (error) {
      console.error('WebNowPlaying: Failed to parse message:', error);
      // Don't crash the app on parse errors
    }
  }

  /**
   * Parse WNP data format to SongData
   */
  private parseWNPDataToSongData(wnpData: WNPData, thumbnailUrl: string | null): SongData {
    // Defensive: Ensure numeric fields are valid numbers
    const durationSeconds = typeof wnpData.duration_seconds === 'number' && !isNaN(wnpData.duration_seconds)
      ? wnpData.duration_seconds
      : 0;
    const positionSeconds = typeof wnpData.position_seconds === 'number' && !isNaN(wnpData.position_seconds)
      ? wnpData.position_seconds
      : 0;
    const volume = typeof wnpData.volume === 'number' && !isNaN(wnpData.volume)
      ? wnpData.volume
      : 0;

    return {
      version: 2,
      album: wnpData.album || null,
      artist: wnpData.artist || null,
      playlist: null,
      playlist_id: null,
      track_name: wnpData.title || 'Unknown Track',
      shuffle_state: typeof wnpData.shuffle_active === 'boolean' ? wnpData.shuffle_active : null,
      repeat_state: this.mapRepeatMode(wnpData.repeat_mode || 'NONE'),
      is_playing: wnpData.state === 'PLAYING',
      abilities: this.getWNPAbilities(),
      track_duration: durationSeconds * 1000, // Convert to ms
      track_progress: positionSeconds * 1000, // Convert to ms
      volume: volume,
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
  private mapToWNPRepeatMode(mode: 'off' | 'all' | 'track'): 'NONE' | 'ALL' | 'ONE' {
    switch (mode) {
      case 'off':
        return 'NONE';
      case 'all':
        return 'ALL';
      case 'track':
        return 'ONE';
      default:
        return 'NONE';
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
        // If we're disconnected and not disposed, schedule a reconnection attempt
        if (!this.isDisposed && !this.reconnectTimeout) {
          console.log('WebNowPlaying: Control command failed due to disconnection, scheduling reconnection');
          this.scheduleReconnect();
        }
        return;
      }

      // Debug: Log outgoing control commands
      console.log('WebNowPlaying: Sending control command:', event);

      try {
        this.ws.send(JSON.stringify(event));
        console.log('WebNowPlaying: Control command sent successfully');
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

    const reconnectDelay = this.currentReconnectDelay;
    console.log(`WebNowPlaying: Scheduling reconnect in ${reconnectDelay}ms`);

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;

      if (!this.isDisposed) {
        try {
          await this.connect();
        } catch (error) {
          // Error already logged in connect()
          // Check if we've hit max reconnection delay
          if (this.currentReconnectDelay >= WebNowPlayingSource.MAX_RECONNECT_DELAY_MS) {
            console.error(
              'WebNowPlaying: Max reconnection delay reached. ' +
                'The source may be permanently unavailable. Check if the browser extension is running.'
            );
          }
        }
      }
    }, reconnectDelay);

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
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      // Note: close() may have already been called in dispose()
      this.ws = null;
    }
  }

  /**
   * Start heartbeat monitoring to detect stale connections
   */
  private startHeartbeat(): void {
    // Clear any existing heartbeat interval
    this.stopHeartbeat();

    // Initialize last message time
    this.lastMessageTime = Date.now();

    this.heartbeatIntervalId = setInterval(() => {
      if (!this._isConnected || this.isDisposed) {
        this.stopHeartbeat();
        return;
      }

      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;

      if (timeSinceLastMessage > WebNowPlayingSource.HEARTBEAT_TIMEOUT_THRESHOLD_MS) {
        console.warn(
          `WebNowPlaying: No data received for ${Math.floor(timeSinceLastMessage / 1000)}s. ` +
            `Connection may be stale.`
        );
        // Reset the timestamp to avoid spamming warnings, but let the natural
        // reconnection logic handle the actual reconnection if needed
        this.lastMessageTime = now;
      }
    }, WebNowPlayingSource.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop heartbeat monitoring
   */
  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  /**
   * Dispose of the media source
   */
  async dispose(): Promise<void> {
    this.isDisposed = true;
    // Close with code 1000 to indicate clean shutdown (prevents reconnection)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000);
    }
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
  // NOTE: These playback controls are required by the MediaSource abstract interface
  // (lines 67-117 in MediaSource.ts). While WebNowPlaying is primarily a metadata
  // capture source, the WNP protocol supports sending control commands back to
  // the browser player, so we implement these to provide full media control.

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
   * Check if the media source is currently connected and active
   * @returns True if connected to WebNowPlaying server and WebSocket is open
   */
  isConnected(): boolean {
    return this._isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get the human-readable name of this media source
   */
  getSourceName(): string {
    return 'WebNowPlaying';
  }
}
