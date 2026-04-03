import { DeskThing } from "@deskthing/server"
import { AUDIO_REQUESTS, DESKTHING_EVENTS, MusicEventPayloads, SongEvent } from "@deskthing/types"
import { MediaStore } from "./mediaStore"
import { setupSettings } from "./setupSettings"

export const initializeListeners = async () => {
  try {
    // Register settings schema with DeskThing first
    await setupSettings()

    const mediaStore = MediaStore.getInstance()
    await mediaStore.initializeListeners()

    // Auto-select source based on current settings
    await mediaStore.autoSelectSource()
  } catch (error) {
    console.error('Error during initialization:', error)
    // Don't throw - allow the app to start even if WNP connection fails
    // The user can try to connect later via settings
  }
}

DeskThing.on(SongEvent.GET, (data) => {
  const mediaStore = MediaStore.getInstance()
  switch (data.request) {
    case AUDIO_REQUESTS.SONG:
      mediaStore.handleGetSong()
      break
    case AUDIO_REQUESTS.REFRESH:
      mediaStore.handleRefresh()
      break
  }
})

DeskThing.on(SongEvent.SET, (data) => {
  const mediaStore = MediaStore.getInstance()
  switch (data.request) {
    case AUDIO_REQUESTS.FAST_FORWARD:
      mediaStore.handleFastForward({ amount: data.payload})
      break
    case AUDIO_REQUESTS.LIKE:
      mediaStore.handleLike()
      break
    case AUDIO_REQUESTS.NEXT:
      mediaStore.handleNext()
      break
    case AUDIO_REQUESTS.PAUSE:
      mediaStore.handlePause()
      break
    case AUDIO_REQUESTS.PLAY:
      mediaStore.handlePlay()
      break
    case AUDIO_REQUESTS.PREVIOUS:
      mediaStore.handlePrevious()
      break
    case AUDIO_REQUESTS.REPEAT:
      mediaStore.handleRepeat()
      break
    case AUDIO_REQUESTS.REWIND:
      mediaStore.handleRewind({ amount: data.payload })
      break
    case AUDIO_REQUESTS.SEEK:
      mediaStore.handleSeek({ positionMs: data.payload })
      break
    case AUDIO_REQUESTS.SHUFFLE:
      mediaStore.handleShuffle({ shuffle: data.payload })
      break
    case AUDIO_REQUESTS.STOP:
      mediaStore.handleStop()
      break
    case AUDIO_REQUESTS.VOLUME:
      mediaStore.handleVolume({ volume: data.payload })
      break
  }
})

// Listen for settings changes to dynamically switch media sources
DeskThing.on(DESKTHING_EVENTS.SETTINGS, async (settings) => {
  try {
    console.log('Settings event received, raw data:', JSON.stringify(settings))
    const mediaStore = MediaStore.getInstance()

    // Handle different possible structures
    let sourceType: 'auto' | 'native' | 'wnp'
    if (settings && typeof settings === 'object') {
      if ('media_source' in settings) {
        sourceType = settings.media_source as 'auto' | 'native' | 'wnp'
      } else if ('value' in settings && typeof settings.value === 'object' && 'media_source' in settings.value) {
        sourceType = settings.value.media_source as 'auto' | 'native' | 'wnp'
      } else {
        console.warn('Settings structure unexpected:', settings)
        sourceType = 'auto'
      }
    } else {
      sourceType = 'auto'
    }

    console.log(`Settings changed - switching to source: ${sourceType}`)
    await mediaStore.setSource(sourceType)
  } catch (error) {
    console.error('Error handling settings change:', error)
    // Don't crash on settings changes
  }
})