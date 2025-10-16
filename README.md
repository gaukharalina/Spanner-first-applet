# Introduction

This sample app is for illustration only.  It is your responsibility to review the Google Maps Platform Terms of Service applicable to your region, and you must confirm that your integration will comply with those terms.  This sample app may show products or functionality that are not available in your region under the Terms of Service for that region.

# Application Architecture: Interactive Day Planner

This document outlines the architecture of the Interactive Day Planner, a web application built with React that showcases a real-time, voice-driven conversational experience using the Gemini API, grounded with data from Google Maps and visualized on a Photorealistic 3D Map.

## 1. Overall Structure & Core Technologies

The application is a **React-based Single Page Application (SPA)**. The architecture is modular, separating concerns into distinct components, hooks, contexts, and utility libraries.

-   **`index.html` & `index.tsx`**: The entry point of the application. It uses an `importmap` to manage modern JavaScript modules and renders the main `App` component into the DOM.
-   **`App.tsx`**: The root component that orchestrates the entire user experience. It initializes context providers and manages the state for the map and grounding responses.
-   **`/components`**: Contains all the reusable React components that make up the UI, such as the `ControlTray` for user input, the `StreamingConsole` for displaying the conversation, and the `Sidebar` for settings.
-   **`/contexts`**: Uses React's Context API to provide global state and functionality. The `LiveAPIContext` is crucial, making the Gemini Live session available throughout the app.
-   **`/hooks`**: Home to custom React hooks, with `use-live-api.ts` being the most significant. This hook encapsulates the logic for managing the connection to the Gemini Live API.
-   **`/lib`**: A collection of client-side libraries and helper functions. This includes the `GenAILiveClient` wrapper, audio processing utilities, state management configuration (Zustand), and tool definitions.
-   **State Management**: The app uses **Zustand**, a lightweight state management library, to handle global UI state, conversation logs, and settings (`lib/state.ts`).

## 2. Gemini Live API Integration

The core of the conversational experience is powered by the Gemini Live API, which enables real-time, low-latency, bidirectional audio streaming.

-   **Connection Management**: The `GenAILiveClient` class (`lib/genai-live-client.ts`) is a custom wrapper around the `@google/genai` SDK. It simplifies the connection lifecycle and uses an event-emitter pattern to broadcast server messages (e.g., `open`, `close`, `audio`, `toolcall`, `inputTranscription`).
-   **`useLiveApi` Hook**: This hook (`hooks/use-live-api.ts`) manages the instance of `GenAILiveClient`. It exposes functions to `connect` and `disconnect` and handles incoming events from the API. Crucially, it contains the `onToolCall` handler that processes function call requests from the model.
-   **Audio Handling**:
    -   **Input**: The `AudioRecorder` class (`lib/audio-recorder.ts`) captures microphone input, processes it using an `AudioWorklet`, and sends PCM audio data to the Gemini Live API via the `sendRealtimeInput` method.
    -   **Output**: The `AudioStreamer` class (`lib/audio-streamer.ts`) receives PCM audio data from the API, queues it, and plays it back seamlessly using the Web Audio API, providing the AI's voice response.
-   **Real-time Transcription**: The application listens for `inputTranscription` and `outputTranscription` events to display the conversation text in the `StreamingConsole` component as it happens, including interim results for a more responsive feel.

## 3. Grounding with Google Maps

To provide accurate, real-world information, the application uses Gemini's ability to ground its responses with Google Maps data.

-   **Tool-Based Invocation**: The model is configured with a `mapsGrounding` tool definition. When the user asks a question that requires location-based information (e.g., "Find some good pizza places in Chicago"), the Gemini model intelligently decides to call this function.
-   **Tool Call Handling**: The `onToolCall` handler in the `useLiveApi` hook intercepts this request. It then calls a helper function (`lib/maps-grounding.ts`) which makes a *separate* request to the Gemini API, this time explicitly invoking the `googleMaps` tool with the user's query.
-   **Data Processing**: The response from this grounding call is a rich `GenerateContentResponse` object containing not only the model's text response but also structured `groundingMetadata`. In `App.tsx`, an effect hook processes this response, extracting place IDs from the metadata.
-   **UI Updates**: Once place details (like location coordinates and display name) are fetched using the Google Maps Places library, the application updates its state, causing markers for these locations to be rendered on the 3D map. Additionally, the `GroundingWidget` component can be used to display a rich, interactive list of places using a `contextToken` provided in the grounding response.

## 4. Google Maps Photorealistic 3D Maps

The visual centerpiece of the application is the Photorealistic 3D Map, which provides an immersive and detailed view of the locations being discussed.

-   **Web Component Integration**: The map is implemented using the `<gmp-map-3d>` web component, part of the Google Maps JavaScript API's alpha channel.
-   **React Wrapper**: A custom React component, `Map3D` (`components/map-3d/map-3d.tsx`), is used to wrap the web component, making it easy to integrate into the React component tree and manage its properties via props.
-   **Camera Control**: The application controls the map's camera in two main ways:
    1.  **Tool Call**: The `displayCityOnMap` tool allows the Gemini model to directly command the map to fly to a specific latitude and longitude.
    2.  **Dynamic Framing**: After a grounding call returns a set of locations, the `lookAt` utility function (`lib/look-at.ts`) calculates the optimal camera position (center, range, tilt) to frame all the resulting markers, and then animates the camera to that position.

## 5. `@vis.gl/react-google-maps` Library

This library acts as a foundational layer for integrating Google Maps into the React application.

-   **API Loading**: The `<APIProvider>` component is wrapped around the entire app. It handles the asynchronous loading of the Google Maps JavaScript API script, ensuring all necessary libraries are available before they are used.
-   **Library Access**: The `useMapsLibrary` hook is used extensively to gain access to specific Maps libraries when needed. For instance, `useMapsLibrary('places')` is used to fetch place details and render the `GroundingWidget`, while `useMapsLibrary('maps3d')` is used to interact with the 3D map custom elements. This hook-based approach ensures that components only render after their required map libraries are loaded and ready.
