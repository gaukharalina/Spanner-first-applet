/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

'use client';

import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {useEffect, useRef} from 'react';

export function GroundingWidget({
  contextToken,
  layout = 'vertical',
  mapMode = 'roadmap',
  mapHidden = false
}: {
  contextToken: string;
  layout?: 'compact' | 'vertical';
  mapMode?: 'roadmap' | 'hybrid';
  mapHidden?: boolean;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const placesLibrary = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLibrary || !contextToken) return;

    const currentElement = elementRef.current;

    async function initializeElement() {
      if (currentElement && placesLibrary) {
        const element = new placesLibrary.PlaceContextualElement();
        element.contextToken = contextToken;

        // Create and append the list config element
        const listConfig = new placesLibrary.PlaceContextualListConfigElement();
        listConfig.layout = layout;
        if (mapHidden) {
          listConfig.mapHidden = true;
        }

        listConfig.setAttribute('map-mode', mapMode);
        element.appendChild(listConfig);

        currentElement.appendChild(element);
      }
    }

    initializeElement();

    return () => {
      if (currentElement) {
        currentElement.innerHTML = '';
      }
    };
  }, [placesLibrary, contextToken, layout, mapHidden, mapMode]);

  return <div ref={elementRef} />;
}