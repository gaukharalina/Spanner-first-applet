/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { FunctionCall } from '../state';
import { FunctionResponseScheduling } from '@google/genai';

export const itineraryPlannerTools: FunctionCall[] = [
  {
    name: 'mapsGrounding',
    description: `
    Call this function to get information about a place, restaurant, or activity from the maps
    grounding agent.

    Args:
        query: a string describing the search parameters. The prompt needs to
        include a location and preferences.

    Returns:
        A response from the maps grounding agent, which will include a
        conversational description and supporting metadata.
    `,
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
        },
      },
      required: ['query'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'displayCityOnMap',
    description: 'Call this function to display a city on the map using its latitude and longitude.',
    parameters: {
      type: 'OBJECT',
      properties: {
        lat: {
          type: 'NUMBER',
        },
        lng: {
          type: 'NUMBER',
        },
      },
      required: ['lat', 'lng'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
];