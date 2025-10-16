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
import React, {useCallback, useState, useEffect} from 'react';

import ControlTray from './components/ControlTray';
import ErrorScreen from './components/ErrorScreen';
import StreamingConsole from './components/streaming-console/StreamingConsole';
import PopUp from './components/popup/PopUp';
import Sidebar from './components/Sidebar';
import { LiveAPIProvider } from './contexts/LiveAPIContext';
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';
import { Map3D, Map3DCameraProps} from './components/map-3d';
import { GenerateContentResponse } from '@google/genai';
import { lookAt } from './lib/look-at';

const API_KEY = process.env.GEMINI_API_KEY as string;
if (typeof API_KEY !== 'string') {
  throw new Error(
    'Missing required environment variable: GEMINI_API_KEY'
  );
}

const INITIAL_VIEW_PROPS = {
  center: {
    lat: 41.8739368,
    lng: -87.6372648,
    altitude: 1000
  },
  range: 3000,
  heading: 0,
  tilt: 30,
  roll: 0
};

function AppComponent() {
  const [map, setMap] = useState<google.maps.maps3d.Map3DElement | null>(null);
  const placesLib = useMapsLibrary('places');
  const [places, setPlaces] = useState<Array<google.maps.places.Place> | null>(
    null
  );
  const [viewProps, setViewProps] = useState(INITIAL_VIEW_PROPS);

  const maps3dLib = useMapsLibrary('maps3d');
  const elevationLib = useMapsLibrary('elevation');

  const [latestGroundingResponse, setLatestGroundingResponse] = useState<GenerateContentResponse | null>(null);
  const [showPopUp, setShowPopUp] = useState(true);

  const handleClosePopUp = () => {
    setShowPopUp(false);
  };
  
  useEffect(() => {
    if (map) {
      const banner = document.querySelector(
        '.vAygCK-api-load-alpha-banner',
      ) as HTMLElement;
      if (banner) {
        banner.style.display = 'none';
      }
    }
  }, [map]);

  // fetch place details from the latest grounding response
  useEffect(() => {
    if (!latestGroundingResponse || !placesLib) return;

    let {groundingChunks} =
      latestGroundingResponse?.candidates[0]?.groundingMetadata ?? {};
    const responseText = latestGroundingResponse?.candidates[0]?.content?.parts?.[0]?.text;

    if (!groundingChunks || !responseText) return;
    // try to filter the marker list down to just what was mentioned in the grounding text
    groundingChunks = groundingChunks.filter(chunk => chunk.maps?.title && responseText.includes(`${chunk.maps?.title}`));
    
    const placesRequests = groundingChunks.map(chunk => {
      const placeId = chunk.maps.placeId.replace('places/', '');
      const place = new placesLib.Place({id: placeId});

      return place.fetchFields({fields: ['location', 'displayName']});
    });

    Promise.allSettled(placesRequests).then(locations => {
      setPlaces(
        locations
          .filter(
            (
              location
            ): location is PromiseFulfilledResult<{
              place: google.maps.places.Place;
            }> => location.status === 'fulfilled'
          )
          .map(location => location.value.place)
      );
    });
  }, [latestGroundingResponse, placesLib]);

  //show place markers on the map
  useEffect(() => {
    if (!map || !places || !maps3dLib || !elevationLib) return;

    map.innerHTML = '';

    for (const place of places) {
      // FIX: Removed unused @ts-expect-error as type is now defined.
      const marker = new maps3dLib.Marker3DInteractiveElement({
        position: {...place?.location?.toJSON(), altitude: 1},
        altitudeMode: 'RELATIVE_TO_MESH',
        label: place?.displayName ?? '',
        drawsWhenOccluded: true
      });

      map.appendChild(marker);
    }
    
    if (places.length === 0) {
      console.log("No places found, skipping map animation.");
      return;
    }

    const flyTo = async () => {
      const elevator = new elevationLib.ElevationService();
      const {lat, lng, altitude, range, tilt} = await lookAt(
        [
          ...places.map(place => ({
            lat: place.location?.lat() ?? 0,
            lng: place.location?.lng() ?? 0,
            altitude: 1
          }))
        ],
        elevator
      );

      map.flyCameraTo({
        durationMillis: 5000,
        endCamera: {
          center: {lat, lng, altitude},
          range: range + 1000,
          heading: 0,
          tilt,
          roll: 0
        }
      });
    };

    flyTo();
  }, [map, places, maps3dLib, elevationLib]);

  const handleCameraChange = useCallback((props: Map3DCameraProps) => {
      setViewProps(oldProps => ({...oldProps, ...props}));
    }, []);

  return (
    <LiveAPIProvider apiKey={API_KEY} setLatestGroundingResponse={setLatestGroundingResponse} map={map}>
        <ErrorScreen />
        <Sidebar />
         {showPopUp && <PopUp onClose={handleClosePopUp} />}
        <div className="streaming-console">
          <div className="console-panel">
            <StreamingConsole />
            <ControlTray />
          </div>
          <div className="map-panel">
              <Map3D
                ref={element => setMap(element ?? null)}
                onCameraChange={handleCameraChange}
                {...viewProps}>
              </Map3D>
          </div>
        </div>
    </LiveAPIProvider>
  );
}


/**
 * Main application component that provides a streaming interface for Live API.
 * Manages video streaming state and provides controls for webcam/screen capture.
 */
function App() {
  return (
    <div className="App">
    <APIProvider
                version={'alpha'}
                apiKey={'AIzaSyCYTvt7YMcKjSNTnBa42djlndCeDvZHkr0'}>  
      <AppComponent />
    </APIProvider>

    </div>
  );
}

export default App;