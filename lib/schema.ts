/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import {z} from 'zod';

export const groundingSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        role: z.string(),
        parts: z.array(z.object({text: z.string()}))
      }),
      finishReason: z.string(),
      groundingMetadata: z.object({
        retrievalQueries: z.array(z.string()),
        groundingChunks: z.array(
          z.object({
            maps: z.object({
              uri: z.string(),
              title: z.string(),
              text: z.string(),
              placeId: z.string()
            })
          })
        ),
        groundingSupports: z.array(
          z.object({
            segment: z.object({
              startIndex: z.number(),
              endIndex: z.number(),
              text: z.string()
            }),
            groundingChunkIndices: z.array(z.number())
          })
        ),
        googleMapsWidgetContextToken: z.string().optional()
      })
    })
  ),
  usageMetadata: z
    .object({
      promptTokenCount: z.number(),
      candidatesTokenCount: z.number(),
      totalTokenCount: z.number(),
      trafficType: z.string(),
      promptTokensDetails: z.array(
        z.object({modality: z.string(), tokenCount: z.number()})
      ),
      candidatesTokensDetails: z.array(
        z.object({modality: z.string(), tokenCount: z.number()})
      ),
      toolUsePromptTokenCount: z.number(),
      thoughtsTokenCount: z.number()
    })
    .optional(),
  modelVersion: z.string(),
  createTime: z.string(),
  responseId: z.string()
});

export type GroundingResponse = z.infer<typeof groundingSchema>;