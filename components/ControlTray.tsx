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

import cn from 'classnames';

import { memo, useEffect, useRef, useState, FormEvent } from 'react';
import { AudioRecorder } from '../lib/audio-recorder';
import { useLogStore, useUI } from '@/lib/state';

import { useLiveAPIContext } from '../contexts/LiveAPIContext';

export type ControlTrayProps = {};

function ControlTray({}: ControlTrayProps) {
  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [textPrompt, setTextPrompt] = useState('');
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const { toggleSidebar } = useUI();

  const { client, connected, connect, disconnect, audioStreamer } =
    useLiveAPIContext();

  useEffect(() => {
    if (audioStreamer.current) {
      audioStreamer.current.gainNode.gain.value = speakerMuted ? 0 : 1;
    }
  }, [speakerMuted, audioStreamer]);

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };
    
    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData);
      audioRecorder.start();
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData);
    };
  }, [connected, client, muted, audioRecorder]);

  const handleMicClick = () => {
    setMuted(!muted);
  };

  const handleLocationClick = () => {
    if (!connected) {
      console.warn('Cannot send location: not connected to live stream.');
      useLogStore.getState().addTurn({
        role: 'system',
        text: `Cannot send location. Please connect to the stream first.`,
        isFinal: true,
      });
      return;
    }

    if (navigator.geolocation) {
      useLogStore.getState().addTurn({
        role: 'system',
        text: 'Getting your current location...',
        isFinal: true,
      });
      navigator.geolocation.getCurrentPosition(
        position => {
          const {latitude, longitude} = position.coords;
          const locationPrompt = `My current location is latitude ${latitude} and longitude ${longitude}. What's nearby?`;

          useLogStore.getState().addTurn({
            role: 'user',
            text: `📍 My current location is latitude ${latitude}, longitude ${longitude}.`,
            isFinal: true,
          });

          client.sendRealtimeText(locationPrompt);
        },
        error => {
          console.error('Error getting user location:', error);
          useLogStore.getState().addTurn({
            role: 'system',
            text: `Could not get your location: ${error.message}`,
            isFinal: true,
          });
        },
      );
    } else {
      console.error('Geolocation is not supported by this browser.');
      useLogStore.getState().addTurn({
        role: 'system',
        text: `Geolocation is not supported by this browser.`,
        isFinal: true,
      });
    }
  };

  const handleTextSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!textPrompt.trim()) return;

    useLogStore.getState().addTurn({
      role: 'user',
      text: textPrompt,
      isFinal: true,
    });
    const currentPrompt = textPrompt;
    setTextPrompt(''); // Clear input immediately

    if (!connected) {
      console.warn("Cannot send text message: not connected to live stream.");
      useLogStore.getState().addTurn({
        role: 'system',
        text: `Cannot send message. Please connect to the stream first.`,
        isFinal: true,
      });
      return;
    }
    client.sendRealtimeText(currentPrompt);
  };

  const micButtonTitle = muted ? 'Unmute microphone' : 'Mute microphone';

  const connectButtonTitle = connected ? 'Stop streaming' : 'Start streaming';

  return (
    <section className="control-tray">
      <nav className={cn('actions-nav')}>
        <button
          type="button"
          aria-label={
            !speakerMuted ? 'Audio output on' : 'Audio output off'
          }
          className={cn('action-button')}
          onClick={() => setSpeakerMuted(!speakerMuted)}
          title={!speakerMuted ? 'Mute audio output' : 'Unmute audio output'}
        >
          <span className="material-symbols-outlined">
            {!speakerMuted ? 'volume_up' : 'volume_off'}
          </span>
        </button>
        <button
          className={cn('action-button mic-button')}
          onClick={handleMicClick}
          title={micButtonTitle}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>
        <button
          className={cn('action-button')}
          onClick={handleLocationClick}
          title="Send my current location"
          disabled={!connected}
        >
          <span className="material-symbols-outlined">my_location</span>
        </button>
        <form className="prompt-form" onSubmit={handleTextSubmit}>
          <input
            type="text"
            className="prompt-input"
            placeholder={
              connected ? 'Type a message...' : 'Connect to start typing...'
            }
            value={textPrompt}
            onChange={e => setTextPrompt(e.target.value)}
            aria-label="Text prompt"
            disabled={!connected}
          />
          <button
            type="submit"
            className="send-button"
            disabled={!textPrompt.trim() || !connected}
            aria-label="Send message"
          >
            <span className="icon">send</span>
          </button>
        </form>
          <button
            className={cn('action-button')}
            onClick={toggleSidebar}
            title="Settings"
            aria-label="Settings"
          >
            <span className="icon">tune</span>
          </button>
      </nav>

      <div className={cn('connection-container', { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn('action-button connect-toggle', { connected })}
            onClick={connected ? disconnect : connect}
            title={connectButtonTitle}
          >
            <span className="material-symbols-outlined filled">
              {connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
    </section>
  );
}

export default memo(ControlTray);