/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

// View Transitions API
interface ViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
  updateCallbackDone: Promise<void>;
  skipTransition(): void;
}

interface Document {
  startViewTransition?(callback: () => void | Promise<void>): ViewTransition;
}
