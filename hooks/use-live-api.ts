/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
* @license
* SPDX-License-Identifier: Apache-2.0
*/
/**
* Copyright 2024 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/


import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { LiveConnectConfig, Modality, LiveServerToolCall } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { GroundingChunk, useLogStore, useSettings } from '@/lib/state';
import { fetchMapsGroundedResponseSDK, fetchMapsGroundedResponseREST } from '@/lib/maps-grounding';
import { GenerateContentResponse } from '@google/genai';

export type UseLiveApiResults = {
 client: GenAILiveClient;
 setConfig: (config: LiveConnectConfig) => void;
 config: LiveConnectConfig;
 audioStreamer: MutableRefObject<AudioStreamer | null>;


 connect: () => Promise<void>;
 disconnect: () => void;
 connected: boolean;


 volume: number;
 heldGroundingChunks: GroundingChunk[] | undefined;
 clearHeldGroundingChunks: () => void;
 heldGroundedResponse: GenerateContentResponse | undefined;
 clearHeldGroundedResponse: () => void;
};


export function useLiveApi({
 apiKey,
 setLatestGroundingResponse,
 map,
}: {
 apiKey: string;
 setLatestGroundingResponse: (
   response: GenerateContentResponse | null,
 ) => void;
 map: google.maps.maps3d.Map3DElement | null;
}): UseLiveApiResults {
 const { model } = useSettings();
 const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);


 const audioStreamerRef = useRef<AudioStreamer | null>(null);


 const [volume, setVolume] = useState(0);
 const [connected, setConnected] = useState(false);
 const [streamerReady, setStreamerReady] = useState(false);
 const [config, setConfig] = useState<LiveConnectConfig>({});
 const [heldGroundingChunks, setHeldGroundingChunks] = useState<
    GroundingChunk[] | undefined
  >(undefined);
 const [heldGroundedResponse, setHeldGroundedResponse] = useState<
    GenerateContentResponse | undefined
  >(undefined);

  const clearHeldGroundingChunks = useCallback(() => {
    setHeldGroundingChunks(undefined);
  }, []);

 const clearHeldGroundedResponse = useCallback(() => {
    setHeldGroundedResponse(undefined);
  }, []);

 // register audio for streaming server -> speakers
 useEffect(() => {
   if (!audioStreamerRef.current) {
     audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
       audioStreamerRef.current = new AudioStreamer(audioCtx);
       setStreamerReady(true);
       audioStreamerRef.current
         .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
           setVolume(ev.data.volume);
         })
         .catch(err => {
           console.error('Error adding worklet:', err);
         });
     });
   }
 }, []);

 useEffect(() => {
   const onOpen = () => {
     setConnected(true);
   };

   const onSetupComplete = () => {
     // Send the initial message once the connection is confirmed open and setup is complete.
     client.sendRealtimeText('hello');
   };

   const onClose = () => {
     setConnected(false);
     stopAudioStreamer();
   };


   const stopAudioStreamer = () => {
     if (audioStreamerRef.current) {
       audioStreamerRef.current.stop();
     }
   };


   const onAudio = (data: ArrayBuffer) => {
     if (audioStreamerRef.current) {
       audioStreamerRef.current.addPCM16(new Uint8Array(data));
     }
   };
   
   const onGenerationComplete = () => {
   };


   // Bind event listeners
   client.on('open', onOpen);
   client.on('setupcomplete', onSetupComplete);
   client.on('close', onClose);
   client.on('interrupted', stopAudioStreamer);
   client.on('audio', onAudio);
   client.on('generationcomplete', onGenerationComplete);


   const onToolCall = async (toolCall: LiveServerToolCall) => {
     useLogStore.getState().setIsAwaitingFunctionResponse(true);
     try {
       const functionResponses: any[] = [];


       for (const fc of toolCall.functionCalls) {
         // Log the function call trigger
         const triggerMessage = `Triggering function call: **${
           fc.name
         }**\n\`\`\`json\n${JSON.stringify(fc.args, null, 2)}\n\`\`\``;
         useLogStore.getState().addTurn({
           role: 'system',
           text: triggerMessage,
           isFinal: true,
         });


         let toolResponse: GenerateContentResponse | string = 'ok';
         let groundedResponse: GenerateContentResponse | null = null;
         try {
           switch (fc.name) {
             case 'mapsGrounding': {
               let lat: number | undefined;
               let lng: number | undefined;


               groundedResponse = await fetchMapsGroundedResponseREST({
                 prompt: fc.args.query as string,
                 lat,
                 lng
               });
              
              //  groundedResponse = await fetchMapsGroundedResponseSDK({
              //    prompt: fc.args.query as string,
              //    lat,
              //    lng
              //  });

               if (groundedResponse) {
                 setLatestGroundingResponse(groundedResponse);
                 setHeldGroundedResponse(groundedResponse);
                 toolResponse = groundedResponse;
                 const groundingChunks =
                  groundedResponse?.candidates?.[0]?.groundingMetadata
                    ?.groundingChunks;
                if (groundingChunks && groundingChunks.length > 0) {
                  setHeldGroundingChunks(groundingChunks);
                }
               }
               break;
             }
             case 'displayCityOnMap': {
               if (fc.args && typeof fc.args.lat === 'number' && typeof fc.args.lng === 'number' && map) {
                 try {
                       const endCamera = {
                         center: {
                           lat: fc.args.lat,
                           lng: fc.args.lng,
                           altitude: 5000
                         },
                         range: 3000,
                         tilt: 10
                       } satisfies google.maps.maps3d.CameraOptions;
                       map.flyCameraTo({
                         endCamera: endCamera,
                         durationMillis: 3000
                       });
                       toolResponse = `Displayed city at latitude ${fc.args.lat} and longitude ${fc.args.lng}.`;


                 } catch (err) {
                   console.error('Error displaying city on map:', err);
                   functionResponses.push({
                     id: fc.id,
                     name: fc.name,
                     response: {error: 'Failed to display city on map'}
                   });
                 }
               }
               break;
             }
             default:
               toolResponse = `Unknown tool called: ${fc.name}.`;
               break;
           }


           // Prepare the response to send back to the model
           functionResponses.push({
             id: fc.id,
             name: fc.name,
             response: { result: toolResponse },
           });
         } catch (error) {
           const errorMessage = `Error executing tool ${fc.name}.`;
           console.error(errorMessage, error);
           // Log error to UI
           useLogStore.getState().addTurn({
             role: 'system',
             text: errorMessage,
             isFinal: true,
           });
           // Inform the model about the failure
           functionResponses.push({
             id: fc.id,
             name: fc.name,
             response: { result: errorMessage },
           });
         }
       }


       // Log the function call response
       if (functionResponses.length > 0) {
         const responseMessage = `Function call response:\n\`\`\`json\n${JSON.stringify(
           functionResponses,
           null,
           2,
         )}\n\`\`\``;
         useLogStore.getState().addTurn({
           role: 'system',
           text: responseMessage,
           isFinal: true,
         });
       }


       client.sendToolResponse({ functionResponses: functionResponses });
     } finally {
       useLogStore.getState().setIsAwaitingFunctionResponse(false);
     }
   };


   client.on('toolcall', onToolCall);


   return () => {
     // Clean up event listeners
     client.off('open', onOpen);
     client.off('setupcomplete', onSetupComplete);
     client.off('close', onClose);
     client.off('interrupted', stopAudioStreamer);
     client.off('audio', onAudio);
     client.off('toolcall', onToolCall);
     client.off('generationcomplete', onGenerationComplete);
   };
 }, [client, setLatestGroundingResponse, map]);


 const connect = useCallback(async () => {
   if (!config) {
     throw new Error('config has not been set');
   }
   useLogStore.getState().clearTurns();
   client.disconnect();
   await client.connect(config);
 }, [client, config]);


 const disconnect = useCallback(async () => {
   client.disconnect();
   setConnected(false);
 }, [setConnected, client]);


 return {
   client,
   config,
   setConfig,
   connect,
   connected,
   disconnect,
   volume,
   heldGroundingChunks,
   clearHeldGroundingChunks,
   heldGroundedResponse,
   clearHeldGroundedResponse,
   audioStreamer: audioStreamerRef,
 };
}