How does it work?
DeskThing uses a client-server architecture that allows any compatible device to connect to your computer and interact with applications hosted on it. The system leverages modern web technologies to provide a responsive experience with minimal resource usage.

Desktop Server
The DeskThing server runs on your computer, serving as the central hub for all connected devices and applications.

Architecture
Built with Electron-Vite, React, TailwindCSS, NodeJS, and ExpressJS, the server implements a listener store architecture using dependency injection. This pattern allows for efficient state management and real-time updates across the entire system.
App Management
Each app runs on its own thread, ensuring stability and isolation. The server can download both official and community apps directly from the internet, handling installation, updates, and dependency management automatically.
Client Management
The server tracks and manages all connected client devices, handling authentication, session management, and data synchronization. It can support multiple simultaneous connections, each with its own state and app configuration.
Communication
WebSockets provide real-time bidirectional communication between the server and clients, enabling instant updates and responsive interactions regardless of the number of connected devices.

Hide Technical Details
Desktop Server Technical Implementation
Store Provider System
DeskThing implements a sophisticated store provider system with lazy loading and dependency injection, ensuring stores are only initialized when needed and dependencies are properly managed.

class StoreProvider {
  // Singleton pattern for managing application stores
  private static instance: StoreProvider
  private stores = {
    platformStore: null,
    appStore: null,
    expressStore: null,
    websocketStore: null
  }

  static getInstance(): StoreProvider {
    if (!StoreProvider.instance) {
      StoreProvider.instance = new StoreProvider()
    }
    return StoreProvider.instance
  }

  async getStore(storeId: string): Promise<any> {
    if (!this.stores[storeId]) {
      this.stores[storeId] = await this.initializeStore(storeId)
    }
    return this.stores[storeId]
  }
}
IPC Communication Handlers
DeskThing implements comprehensive IPC handlers to manage communication between the Electron frontend and backend, handling app management, platform operations, and client messaging.

// IPC Handler setup for Electron frontend-backend communication
function setupIPCHandlers(): void {
  // Handle UI requests to manage apps
  ipcMain.handle('app:start', async (event, appId) => {
    const appStore = await StoreProvider.getInstance().getStore('appStore')
    return await appStore.runApp(appId)
  })
  
  // Handle UI requests for platform operations
  ipcMain.handle('platform:getDevices', async () => {
    const platformStore = await StoreProvider.getInstance().getStore('platformStore')
    return await platformStore.getConnectedDevices()
  })
  
  // Handle UI requests for client operations
  ipcMain.handle('client:sendMessage', async (event, clientId, message) => {
    const platformStore = await StoreProvider.getInstance().getStore('platformStore')
    return await platformStore.routeMessage('ui', clientId, message)
  })
}
Client Connection Flow
DeskThing handles client connections through a sophisticated flow that manages initial HTTP connections, client registration, and subsequent WebSocket connections for real-time communication.

// Client connection flow
async function handleNewClient(req, res): Promise<void> {
  // Express platform handles initial connection
  const expressStore = await StoreProvider.getInstance().getStore('expressStore')
  const clientInfo = await expressStore.registerClient(req)
  
  // Serve client app and connection details
  res.json({
    clientId: clientInfo.id,
    wsEndpoint: expressStore.getWebSocketEndpoint()
  })
  
  // After client receives connection info, they'll connect to WebSocket
  const websocketStore = await StoreProvider.getInstance().getStore('websocketStore')
  websocketStore.awaitClientConnection(clientInfo.id)
}
Cross-Platform Communication System
DeskThing's platform system enables seamless communication across different devices and platforms, with a unified API for sending and receiving data regardless of the underlying connection method.

class PlatformStore {
  private platforms = {
    adb: null,
    websocket: null,
    express: null
  }
  private clients = new Map()

  async initializePlatforms(): Promise<void> {
    this.platforms.adb = new ADBPlatform()
    this.platforms.websocket = new WebSocketPlatform()
    this.platforms.express = new ExpressPlatform()
    
    // Setup listeners for each platform
    Object.values(this.platforms).forEach(platform => {
      this.setupListeners(platform)
    })
  }

  async handleDeviceConnection(device): Promise<void> {
    // First connect via ADB for configuration
    await this.platforms.adb.configureDevice(device)
    
    // Then establish other connections as needed
    this.platforms.websocket.connectDevice(device)
  }

  async routeMessage(source, target, data): Promise<void> {
    // Route messages between platforms, clients, and apps
    const platform = this.getPlatformForTarget(target)
    platform.sendMessage(target, data)
  }
}
Comprehensive App Management
DeskThing's app management system provides a robust framework for installing, running, and communicating with apps, complete with progress tracking and error handling.

class AppStore {
  private appProcessStore = null
  private appSettings = {}
  private appTasks = {}
  
  constructor() {
    this.appProcessStore = new AppProcessStore()
  }

  async runApp(appId: string): Promise<void> {
    try {
      // Load app settings
      const settings = await this.getAppSettings(appId)
      
      // Start the app process via AppProcessStore
      await this.appProcessStore.startApp(appId, settings)
      
      // Register app communication channels
      this.registerAppEventHandlers(appId)
    } catch (error) {
      console.error('Failed to run app:', error)
    }
  }
  
  // Handle inter-app communication
  async routeAppMessage(sourceApp, targetApp, data): Promise<void> {
    if (this.appProcessStore.isAppRunning(targetApp)) {
      await this.appProcessStore.sendToApp(targetApp, data)
    }
  }
  
  // Handle app-client communication
  async routeAppToClient(appId, clientId, data): Promise<void> {
    // Get platform store to send to client
    const platformStore = await StoreProvider.getInstance().getStore('platformStore')
    platformStore.routeMessage('app', clientId, data)
  }
}
View on GitHub
Architecture Overview
UI Layer (Electron Frontend)
User Interface
UI Events
UI State
IPC Handler Layer
Frontend-Backend Communication
Event Routing
Request Handling
Store Provider Layer
StoreProvider
Store Initialization
Dependency Management
Platform Layer
ADB Platform
WebSocket Platform
Express Platform
App Management Layer
AppStore
AppProcessStore
Multi-threaded Apps
Data Flow Architecture
Electron UI
IPC Handlers
Store Provider
Platform Store
ADB
WebSocket
Express
App Store
AppProcessStore
Other Stores
Settings
Data
Devices
via ADB Platform
Clients
via Express & WebSocket
Apps
via Worker Threads
Client Connection Flow
How clients connect to the DeskThing server

Client Device
Express Platform
Initial Connection & Registration
WebSocket Platform
Realtime Communication
App Communication Flow
How apps communicate within the system

App (Worker Thread)
AppProcessStore
Thread Management
AppStore
Settings, Tasks, Actions
Other Apps
Clients
Event-Driven Architecture
Central event bus for cross-component communication

UI Events
App Events
Client Events
Central Event Bus
Store Listeners
Platform Listeners
App Listeners
Store Provider System
Centralized store management with dependency injection

StoreProvider
PlatformStore
AppStore
ExpressStore
WebSocketStore
IPC Handlers
App Processes
Platform Services
Performance Optimizations
Multi-threaded Architecture
Isolated app processes
Worker thread pooling
Process crash isolation
Parallel execution
Store Management
Lazy store initialization
Dependency injection
Centralized state management
Communication Optimization
Message batching
Efficient IPC channels
Targeted event routing
Data Management Strategy
Optimized data flow and storage across the system

UI Data
IPC Handlers
Store Layer
App Data
AppProcessStore
AppStore
Client Data
Platform Stores
Store Layer
~5ms
Avg Response Time
99.9%
Uptime
100+
Apps Supported
~2%
CPU Usage
Client Devices
The DeskThing client runs on any device with a modern browser, transforming it into an interactive control surface and display for your applications.

Universal Compatibility
Works on phones, tablets, computers, Car Thing devices, smart fridges, or anything that can run a browser and connect via cable or LAN to the desktop. No app installation required—just navigate to the provided URL.
Interactive Interface
The client renders app UIs and allows users to navigate between apps, trigger actions, modify settings, and interact with content—all from the connected device. The interface adapts to different screen sizes and orientations automatically.
Reactive Architecture
Built with Zustand for state management, along with Vite, React, and TailwindCSS, the client provides a fully reactive experience. UI updates happen instantly in response to state changes, without requiring page refreshes.
Offline Capabilities
The client can cache certain app data and continue displaying information even during brief connection interruptions, ensuring a smooth user experience in less-than-ideal network conditions.

Hide Technical Details
Client Technical Implementation
Smart State Management with Zustand
DeskThing client uses Zustand for state management, providing a lightweight yet powerful solution with TypeScript integration. This enables type-safe state updates and simplified component access to global state without complex providers.

import { create } from 'zustand';

interface SettingsState {
  preferences: {
    theme: 'light' | 'dark' | 'system';
    notifications: boolean;
    screensaverType: string;
  };
  updatePreferences: (newPrefs: Partial<SettingsState['preferences']>) => void;
  updateCurrentView: (view: AppView) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  preferences: {
    theme: 'system',
    notifications: true,
    screensaverType: 'clock'
  },
  updatePreferences: (newPrefs) => set((state) => ({
    preferences: { ...state.preferences, ...newPrefs }
  })),
  updateCurrentView: (view) => set((state) => ({
    preferences: {
      ...state.preferences,
      currentView: view
    }
  }))
}));
Real-time Communication with WebSockets
The client maintains a persistent connection to the server using WebSockets, enabling real-time updates and interactions. The WebSocketManager handles connection management, automatic reconnection with exponential backoff, and message distribution to registered listeners.

export class WebSocketManager {
  private socket: WebSocket | null = null;
  private listeners: Array<(message: any) => void> = [];
  private reconnectAttempts = 0;
  private url: string = '';

  connect(url: string): void {
    this.url = url;
    this.socket = new WebSocket(url);
    
    this.socket.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
    };
    
    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.notifyListeners(data);
    };
    
    this.socket.onclose = () => {
      if (this.reconnectAttempts < 5) {
        setTimeout(() => this.reconnect(), 1000 * Math.pow(2, this.reconnectAttempts));
        this.reconnectAttempts++;
      }
    };
  }
  
  async send(message: any): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
  
  private notifyListeners(message: any): void {
    this.listeners.forEach(listener => listener(message));
  }
}
Elegant Screen Saver Implementation
DeskThing includes a sophisticated screen saver system that activates after a period of inactivity. The implementation uses React hooks for state management and cleanup, with smooth transitions and support for multiple screen saver types that can be configured in settings.

const ScreenSaverWrapper: React.FC = () => {
  const { screensaverType } = useSettingsStore((state) => state.preferences);
  const [isActive, setIsActive] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start screen saver after inactivity
  useEffect(() => {
    if (isDismissed) return;
    
    inactivityTimeoutRef.current = setTimeout(() => {
      setIsActive(true);
    }, 60000); // 1 minute of inactivity
    
    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
    };
  }, [isActive, isDismissed]);

  // Render appropriate screensaver based on settings
  const renderScreenSaver = () => {
    switch (screensaverType) {
      case 'clock':
        return <DigitalClock />;
      case 'logo':
        return <BrandLogo />;
      default:
        return <DarkScreen />;
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 transition-opacity duration-1000 ${
        isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {renderScreenSaver()}
    </div>
  );
};
App Tray for Quick Access
The App Tray provides quick access to installed applications with a clean, responsive interface. Each app button asynchronously loads its icon and provides visual feedback on interaction, creating a native-like experience in the browser.

const AppTrayButton: React.FC<{ app: AppInfo }> = ({ app }) => {
  const { getAppIcon } = useAppStore();
  const { updateCurrentView } = useSettingsStore();
  const [appIcon, setAppIcon] = useState<string>("");

  useEffect(() => {
    // Load app icon asynchronously
    const loadAppIcon = async () => {
      const iconUrl = await getAppIcon(app);
      setAppIcon(iconUrl);
    };
    
    loadAppIcon();
  }, [app, getAppIcon]);

  const handleAppLaunch = () => {
    updateCurrentView({
      name: app.name,
      enabled: true,
      running: true,
      timeStarted: Date.now(),
      prefIndex: 0
    });
  };

  return (
    <Button 
      onClick={handleAppLaunch} 
      className="w-24 h-24 m-2 flex flex-col items-center justify-center rounded-xl hover:bg-gray-700/30"
    >
      <img 
        src={appIcon} 
        alt={app.name} 
        className="w-12 h-12 mb-2" 
      />
      <span className="text-sm text-center">{app.manifest?.label || app.name}</span>
    </Button>
  );
};
Settings Management with Type Safety
DeskThing's settings components are fully typed with TypeScript, ensuring type safety throughout the application. This component demonstrates the toggle switch UI with proper accessibility support, visual feedback, and clean integration with the settings system.

export const SettingsBooleanComponent: React.FC<{
  setting: {
    key: string;
    label: string;
    description?: string;
    value: boolean;
    disabled?: boolean;
  };
  onChange: (value: boolean) => void;
}> = ({ setting, onChange }) => {
  return (
    <div className="flex items-center justify-between p-4 border-b">
      <div>
        <h3 className="text-lg font-medium">{setting.label}</h3>
        {setting.description && (
          <p className="text-sm text-gray-500">{setting.description}</p>
        )}
      </div>
      
      <button
        disabled={setting.disabled}
        onClick={() => onChange(!setting.value)}
        className={`w-14 h-8 rounded-full relative transition-colors ${
          setting.value ? 'bg-blue-500' : 'bg-gray-300'
        }`}
      >
        <span 
          className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
            setting.value ? 'translate-x-7' : 'translate-x-1'
          }`} 
        />
      </button>
    </div>
  );
};
View Client on GitHub
Links API Layer
The Links system serves as a sophisticated API layer that simplifies communication between app components and the DeskThing ecosystem.

Unified Communication
Imported as a node module into both the app's UI and backend, Links provides a consistent interface for listening, fetching, or sending data between the server and the app's components, abstracting away the complexity of network communication.
Type Safety
The API is fully typed using TypeScript, providing autocomplete suggestions, compile-time error checking, and documentation directly in the development environment, reducing bugs and improving developer productivity.
Component Integration
Links simplifies the process of adding tasks, settings, mappings, keys, buttons, icons, and other UI elements that need to interact with the backend. Developers can define these components declaratively and Links handles the communication automatically.
State Synchronization
The system ensures that state changes are properly synchronized between the frontend and backend, maintaining consistency across the entire application even when multiple clients are connected.
Community Apps
Apps are the heart of the DeskThing ecosystem, providing specialized functionality while maintaining a consistent user experience.

Dual Architecture
Each app contains both UI and backend logic. The UI is essentially a web page with all the flexibility that web technologies offer, while the backend runs on a dedicated thread within the DeskThing server, providing access to system resources and persistent storage.
Backend Capabilities
The app backend has access to user-configurable settings, guided setup tasks, triggerable actions, and system APIs. It can perform operations that require elevated permissions or system access while maintaining security through the DeskThing sandbox.
Development Tools
Apps have access to a CLI during development that simplifies the build process, enables emulating the DeskThing environment for testing, and allows sending sample settings or data to the backend for debugging purposes without requiring a full deployment.
Distribution
Once developed, apps can be packaged and distributed through the DeskThing app marketplace or shared directly as installation files. The DeskThing server handles installation, dependency resolution, and updates automatically.
Technical Architecture
DeskThing Architecture
├── Core Runtime (Node.js + Electron)
│   ├── Resource Manager
│   ├── App Lifecycle Manager
│   └── System Integration Layer
├── Express Web Server
│   ├── Client Connection Handler
│   └── WebSocket Communication
├── React + Vite Client Interface
│   ├── Layout Engine
│   └── Theme Manager
└── App SDK
    ├── Development Tools
    ├── Dual Architecture Components
    └── Backend Capabilities API   
Data Flow Process
Client connects to server via local network
Server authenticates client and sends available apps
Client requests specific app data
Server processes request, fetches data from relevant sources
Data is sent back to client for rendering
Real-time updates are pushed via WebSocket connection
Technology Stack
Server: Node.js, Electron, Express.js
Client: React, Vite, Tailwind CSS
Communication: WebSockets, REST APIs
Development: TypeScript for type safety
Packaging: Custom app bundling system
App Development Process
1. Development
Developers create apps using the DeskThing SDK, which provides a standardized interface for both frontend and backend components. Apps can be built with almost any software or framework, though the official apps use Node.js for the backend and React for the frontend.

2. Packaging
Once developed, apps are compiled, zipped, and packaged into a format that can be easily installed on the DeskThing server. This package includes all necessary assets, dependencies, and configuration files needed for the app to function properly.

3. Distribution
Packaged apps can be shared with other DeskThing users or submitted to the app marketplace. Installation is as simple as dropping the app package into the DeskThing server, which automatically handles extraction, registration, and initialization.

Setup Process Simplicity
Despite the complex technology behind it, setting up DeskThing is remarkably simple:

1
Install DeskThing on your computer with the provided installer

2
Navigate to the URL provided by DeskThing on your mobile device

3
Start using your device as a DeskThing with the installed apps

Security First
DeskThing operates exclusively on your local network, minimizing security risks associated with cloud-based solutions. All communication between the server and clients is handled within your network, ensuring that sensitive information remains private. The app validation process also includes security checks to prevent malicious code from being executed.

Efficient Resource Management
The DeskThing server includes a sophisticated resource manager that monitors and optimizes system usage. It allocates resources efficiently among running apps, ensures that background processes don't consume excessive CPU or memory, and implements throttling mechanisms when necessary to maintain overall system performance.

DeskThing transforms the complex process of device communication into a seamless experience, making it accessible to users of all technical backgrounds while providing powerful tools for developers to create innovative applications.

DeskThing Types
TypeScript type definitions for the DeskThing application framework.

Installation
Install types
npm install @deskthing/types

Create new DeskThing app
npm create deskthing@latest

or
npx @deskthing/cli template

Install core packages
npm install @deskthing/client @deskthing/server

Core Types
Actions
Action - Defines an executable action with properties like id, name, value, etc.
ActionReference - Reference to an action with minimal properties
EventMode - Enum for different input event types (KeyUp, KeyDown, Swipes, etc.)
Key - Defines a key mapping with modes and metadata
App Events
ServerEvent - Enum for server-side events (MESSAGE, DATA, GET, etc.)
SEND_TYPES - Enum for client-to-server communication types
GetTypes - Types for 'get' event requests
Client
ClientManifest - Client details like name, version, device info
ClientPreferences - User preferences for client appearance/behavior
App - Interface for app state in client
KeyTrigger - Interface for key trigger events
Tasks
Task - Defines a task with steps and metadata
Step - Base interface for task steps
TaskStep - Standard step in a task
TaskAction - Step requiring action execution
TaskSetting - Step requiring settings input
STEP_TYPES - Enum for different step types
Settings
SettingsType - Union type of all setting types
SettingsNumber - Number input setting
SettingsBoolean - Boolean toggle setting
SettingsString - Text input setting
SettingsSelect - Dropdown select setting
SettingsMultiSelect - Multiple selection setting
SettingsColor - Color picker setting
AppSettings - Record of app settings
Music
SongData - Current playing song information
ThemeColor - Color theme information
AUDIO_REQUESTS - Enum for audio control requests
Utils
AppManifest - Application manifest type
PlatformTypes - Supported platform types
TagTypes - App categorization tags
LOGGING_LEVELS - Log level types
SocketData - Socket communication data type
Usage
import { Action, ServerEvent, ClientManifest } from "@deskthing/types";
import { DeskThing } from "@deskthing/server";

// Define an action
const myAction: Action = {
  id: "my-action",
  name: "My Action",
  version: "1.0.0",
  enabled: true,
};

DeskThing.registerAction(myAction);

DeskThing.on(ServerEvent.ACTION, (event) => {
  // Handle action event
});
// Handle server events
function handleEvent(event: ServerEvent) {
  switch (event) {
    case ServerEvent.DATA:
      // Handle data event
      break;
    case ServerEvent.ACTION:
      // Handle action event
      break;
  }
}
License
MIT