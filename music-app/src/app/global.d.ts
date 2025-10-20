// global.d.ts

export {};

declare global {
  interface Window {
    Spotify: any;
    onSpotifyWebPlaybackSDKReady: () => void;
  }

  namespace Spotify {
    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }

    interface Player {
      new (options: PlayerInit): Player;
      connect(): Promise<boolean>;
      disconnect(): void;
      addListener(event: string, callback: (data: any) => void): void;
      removeListener(event: string): void;
      getCurrentState(): Promise<any>;
      pause(): Promise<void>;
      resume(): Promise<void>;
      togglePlay(): Promise<void>;
      seek(position_ms: number): Promise<void>;
    }
  }
}