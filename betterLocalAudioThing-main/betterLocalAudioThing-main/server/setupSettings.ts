/**
 * setupSettings - Initializes the app settings schema
 *
 * This file configures the DeskThing settings UI with all the options
 * needed for managing media sources and WebNowPlaying connection.
 */

import { DeskThing } from "@deskthing/server";
import { SETTING_TYPES, AppSettings } from "@deskthing/types";

/**
 * Settings schema for the betterLocalAudioThing app
 *
 * Defines all user-configurable options:
 * - Media source selection (Auto-Detect, OS Native, WebNowPlaying)
 * - WebNowPlaying connection settings
 * - Auto-detection and fallback behavior
 */
export const settingsSchema: AppSettings = {
  media_source: {
    id: 'media_source',
    label: 'Media Source',
    description: 'Choose the media source for capturing music data. Auto-Detect will try WebNowPlaying first if available.',
    type: SETTING_TYPES.SELECT,
    value: 'auto',
    options: [
      { label: 'Auto-Detect', value: 'auto' },
      { label: 'OS Native', value: 'native' },
      { label: 'WebNowPlaying', value: 'wnp' },
    ],
  },
  wnp_auto_detect: {
    id: 'wnp_auto_detect',
    label: 'WNP Auto-Detect',
    description: 'When in Auto mode, prefer WebNowPlaying if a connection is available. Disable to force OS Native source.',
    type: SETTING_TYPES.BOOLEAN,
    value: true,
  },
  wnp_fallback: {
    id: 'wnp_fallback',
    label: 'WNP Fallback to Native',
    description: 'Automatically fall back to OS Native source if WebNowPlaying disconnects.',
    type: SETTING_TYPES.BOOLEAN,
    value: true,
  },
  wnp_host: {
    id: 'wnp_host',
    label: 'WNP Host Address',
    description: 'The WebSocket host address for the WebNowPlaying browser extension.',
    type: SETTING_TYPES.STRING,
    value: 'localhost',
  },
  wnp_port: {
    id: 'wnp_port',
    label: 'WNP Port',
    description: 'The WebSocket port for the WebNowPlaying browser extension.',
    type: SETTING_TYPES.NUMBER,
    value: 6534,
    min: 1024,
    max: 65535,
  },
};

/**
 * Initialize the app settings with DeskThing
 *
 * This should be called during app initialization to register
 * all settings with the DeskThing platform.
 */
export const setupSettings = async (): Promise<void> => {
  try {
    await DeskThing.initSettings(settingsSchema);
    console.log('Settings initialized successfully');
  } catch (error) {
    console.error('Failed to initialize settings:', error);
    throw error;
  }
};
