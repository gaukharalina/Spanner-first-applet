/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useRef } from 'react';
// import WelcomeScreen from '../welcome-screen/WelcomeScreen';
// FIX: Import LiveServerContent to correctly type the content handler.
import { LiveConnectConfig, Modality, LiveServerContent } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import {
  useSettings,
  useLogStore,
  useTools,
  ConversationTurn,
  useUI,
} from '@/lib/state';
import { SourcesPopover } from '../sources-popover/sources-popover';
import { GroundingWidget } from '../GroundingWidget';

const formatTimestamp = (date: Date) => {
  const pad = (num: number, size = 2) => num.toString().padStart(size, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

export default function StreamingConsole() {
  const {
    client,
    setConfig,
    heldGroundingChunks,
    clearHeldGroundingChunks,
    heldGroundedResponse,
    clearHeldGroundedResponse,
  } = useLiveAPIContext();
  const { systemPrompt, voice } = useSettings();
  const { tools } = useTools();
  const turns = useLogStore(state => state.turns);
  const { showSystemMessages } = useUI();
  const isAwaitingFunctionResponse = useLogStore(
    state => state.isAwaitingFunctionResponse,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayedTurns = showSystemMessages
    ? turns
    : turns.filter(turn => turn.role !== 'system');

  // Set the configuration for the Live API
  useEffect(() => {
    const enabledTools = tools
      .filter(tool => tool.isEnabled)
      .map(tool => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      }));
    // Using `any` for config to accommodate `speechConfig`, which is not in the
    // current TS definitions but is used in the working reference example.
    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
      tools: enabledTools,
      thinkingConfig: {
        thinkingBudget: 0
      },
    };

    setConfig(config);
  }, [setConfig, systemPrompt, tools, voice]);

  useEffect(() => {
    const { addTurn, updateLastTurn } = useLogStore.getState();

    const handleInputTranscription = (text: string, isFinal: boolean) => {
      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];
      if (last && last.role === 'user' && !last.isFinal) {
        updateLastTurn({
          text: last.text + text,
          isFinal,
        });
      } else {
        addTurn({ role: 'user', text, isFinal });
      }
    };

    const handleOutputTranscription = (text: string, isFinal: boolean) => {
      const turns = useLogStore.getState().turns;
      const last = turns[turns.length - 1];
      if (last && last.role === 'agent' && !last.isFinal) {
        updateLastTurn({
          text: last.text + text,
          isFinal,
        });
      } else {
        const turnData: Omit<ConversationTurn, 'timestamp'> = {
          role: 'agent',
          text,
          isFinal,
        };
        if (heldGroundingChunks) {
          turnData.groundingChunks = heldGroundingChunks;
          clearHeldGroundingChunks();
        }
        if (heldGroundedResponse) {
          turnData.toolResponse = heldGroundedResponse;
          clearHeldGroundedResponse();
        }
        addTurn(turnData);
      }
    };

    // FIX: The 'content' event provides a single LiveServerContent object.
    // The function signature is updated to accept one argument, and groundingMetadata is extracted from it.
    const handleContent = (serverContent: LiveServerContent) => {
      const text =
        serverContent.modelTurn?.parts
          ?.map((p: any) => p.text)
          .filter(Boolean)
          .join(' ') ?? '';
      const groundingChunks = serverContent.groundingMetadata?.groundingChunks;

      if (!text && !groundingChunks) return;

      const turns = useLogStore.getState().turns;
      // FIX: Replace .at(-1) with array indexing for broader compatibility.
      const last = turns[turns.length - 1];

      if (last?.role === 'agent' && !last.isFinal) {
        const updatedTurn: Partial<ConversationTurn> = {
          text: last.text + text,
        };
        if (groundingChunks) {
          updatedTurn.groundingChunks = [
            ...(last.groundingChunks || []),
            ...groundingChunks,
          ];
        }
        updateLastTurn(updatedTurn);
      } else {
        const newTurnData: Omit<ConversationTurn, 'timestamp'> = {
          role: 'agent',
          text,
          isFinal: false,
          groundingChunks,
        };
        if (heldGroundingChunks) {
          const combinedChunks = [
            ...(heldGroundingChunks || []),
            ...(newTurnData.groundingChunks || []),
          ];
          newTurnData.groundingChunks = combinedChunks;
          clearHeldGroundingChunks();
        }
        if (heldGroundedResponse) {
          newTurnData.toolResponse = heldGroundedResponse;
          clearHeldGroundedResponse();
        }
        addTurn(newTurnData);
      }
    };

    const handleTurnComplete = () => {
      const turns = useLogStore.getState().turns;
      // FIX: Replace .at(-1) with array indexing for broader compatibility.
      const last = turns[turns.length - 1];
      if (last && !last.isFinal) {
        updateLastTurn({ isFinal: true });
      }
    };

    client.on('inputTranscription', handleInputTranscription);
    client.on('outputTranscription', handleOutputTranscription);
    client.on('content', handleContent);
    client.on('turncomplete', handleTurnComplete);
    client.on('generationcomplete', handleTurnComplete);

    return () => {
      client.off('inputTranscription', handleInputTranscription);
      client.off('outputTranscription', handleOutputTranscription);
      client.off('content', handleContent);
      client.off('turncomplete', handleTurnComplete);
      client.off('generationcomplete', handleTurnComplete);
    };
  }, [
    client,
    heldGroundingChunks,
    clearHeldGroundingChunks,
    heldGroundedResponse,
    clearHeldGroundedResponse,
  ]);

  useEffect(() => {
    if (scrollRef.current) {
      // The widget has a 300ms transition for max-height. We need to wait
      // for that transition to finish before we can accurately scroll to the bottom.
      const scrollTimeout = setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 350); // A little longer than the transition duration

      return () => clearTimeout(scrollTimeout);
    }
  }, [turns, isAwaitingFunctionResponse]);

  return (
    <div className="transcription-container">
      {displayedTurns.length === 0 && !isAwaitingFunctionResponse ? (
        <div></div>
      ) : (
        <div className="transcription-view" ref={scrollRef}>
          {displayedTurns.map((t) => {
            if (t.role === 'system') {
              return (
                <div
                  key={t.timestamp.toISOString()}
                  className={`transcription-entry system`}
                >
                  <div className="transcription-header">
                    <div className="transcription-source">System</div>
                    <div className="transcription-timestamp">
                      {formatTimestamp(t.timestamp)}
                    </div>
                  </div>
                  <div className="transcription-text-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{t.text}</ReactMarkdown>
                  </div>
                </div>
              )
            }
            const widgetToken =
              t.toolResponse?.candidates?.[0]?.groundingMetadata
                ?.googleMapsWidgetContextTokens?.[0];
            return (
              <div
                key={t.timestamp.toISOString()}
                className={`transcription-entry ${t.role} ${!t.isFinal ? 'interim' : ''
                  }`}
              >
                <div className="avatar">
                  <span className="icon">{t.role === 'user' ? 'person' : 'auto_awesome'}</span>
                </div>
                <div className="message-bubble">
                  <div className="transcription-text-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {t.text}
                    </ReactMarkdown>
                  </div>
                  {t.groundingChunks && t.groundingChunks.length > 0 && !widgetToken && (
                    <SourcesPopover
                      className="grounding-chunks"
                      sources={
                        t.groundingChunks
                          .map(chunk => {
                            const source = chunk.web || chunk.maps;
                            if (source && source.uri) {
                              return {
                                uri: source.uri,
                                title: source.title || source.uri,
                              };
                            }
                            return null;
                          })
                          .filter((s): s is { uri: string; title: string } => s !== null)
                      }
                    />
                  )}
                  {widgetToken && (
                    <div
                      style={{
                        marginTop: '12px',
                        transition: 'opacity 0.3s ease-in-out, max-height 0.3s ease-in-out',
                        opacity: t.isFinal ? 1 : 0,
                        // maxHeight: t.isFinal ? '1000px' : '0px',
                        overflow: 'hidden',
                      }}
                    >
                      {t.groundingChunks && t.groundingChunks.length === 1 ? (
                        <GroundingWidget
                          contextToken={widgetToken}
                          layout="vertical"
                          mapHidden={false}
                        />
                      ) : (
                        <GroundingWidget
                          contextToken={widgetToken}
                          mapHidden={true}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {isAwaitingFunctionResponse && (
            <div className="spinner-container">
              <div className="spinner"></div>
              <p>Calling tool...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}