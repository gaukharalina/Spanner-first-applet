(() => {
  if (window.self === window.top) {
    // Do not run the shim in the main window, only in iframes.
    return;
  }

  window.API_KEY = 'GEMINI_API_KEY';
  window.GEMINI_API_KEY = 'GEMINI_API_KEY';
  window.process = window.process || {};
  window.process.env = window.process.env || {};
  window.process.env.API_KEY = window.API_KEY;
  window.process.env.GEMINI_API_KEY = window.GEMINI_API_KEY;

  const bootstrapChannel = new Promise((resolve) => {
    window.addEventListener('message', (event) => {
      if (event.origin !== 'https://localhost.corp.google.com:26001') {
        return;
      }

      if (event.data.type === 'bootstrap') {
        resolve({
          port: event.ports[0],
          urlPatterns:
              event.data.urlPatterns.map((pattern) => new RegExp(pattern)),
        });
      }
    });
  });

  window.aistudio = window.aistudio || {
    getHostUrl: async function() {
      const hostPort = (await bootstrapChannel).port;
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        hostPort.postMessage(
            {type: 'get_host_url'},
            [channel.port2]);
        const port = channel.port1;
        port.onmessage = (message) => {
          resolve(message.data.url);
        };
      });
    },
    hasSelectedApiKey: async function() {
      const hostPort = (await bootstrapChannel).port;
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        hostPort.postMessage(
            {type: 'has_selected_api_key'},
            [channel.port2]);
        const port = channel.port1;
        port.onmessage = (message) => {
          resolve(message.data);
        };
      });
    },
    openSelectKey: async function() {
      const hostPort = (await bootstrapChannel).port;
      const channel = new MessageChannel();
      hostPort.postMessage(
          {type: 'open_select_key'},
          [channel.port2]);
    },
    getModelQuota: async function(model) {
      const hostPort = (await bootstrapChannel).port;
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        hostPort.postMessage(
            {type: 'get_model_quota', model},
            [channel.port2]);
        const port = channel.port1;
        port.onmessage = (message) => {
          resolve(message.data.modelQuota);
        };
      });
    },
  };

  const nativeFetch = window.fetch;

  /**
   * @param {string | URL | Request} resource The resource of the fetch request.
   * @param {RequestInit} options The options of the fetch request.
   * @return {Promise!} The promise of the fetch request.
   */
  async function fetch(resource, options) {
    const config = await bootstrapChannel;

    const request = resource instanceof Request ?
      resource.clone() :
      new Request(resource, options);

    if (!config.urlPatterns.some((pattern) => request.url.match(pattern))) {
      return nativeFetch(resource, options);
    }
    const hostPort = config.port;

    const channel = new MessageChannel();
    const port = channel.port1;
    let bodyBytes;
    const transfer = [channel.port2];
    const parts = [];
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength) {
      bodyBytes = buffer;
      transfer.push(bodyBytes);
    }
    hostPort.postMessage(
        {
          type: 'fetch',
          url: request.url,
          method: request.method,
          headers: [...request.headers.entries()],
          body: bodyBytes,
        },
        transfer);

    let streamController;
    const body = new ReadableStream({
      start(controller) {
        streamController = controller;
      },
    });
    let resolveReceive;
    const receivePromise = new Promise((resolve) => {
      resolveReceive = resolve;
    });
    port.onmessage = (message) => {
      switch (message.data.type) {
        case 'response':
          resolveReceive(new Response(body, {
            status: message.data.status,
            statusText: message.data.statusText,
            headers: new Headers(message.data.headers),
          }));
          break;
        case 'body':
          streamController.enqueue(message.data.data);
          break;
        case 'body_done':
          streamController.close();
          break;
      }
    };
    return receivePromise;
  }

  Object.defineProperty(window, 'fetch', {
    get: function() {
      return fetch;
    },
  });

  // See details in: https://github.com/angular/angular/issues/63064.
  function patchHistoryStateFunctionForAngular(originalFn, baseHref) {
    return (state, unused, url) => {
      if (typeof url === 'string' && !url.startsWith('blob:')) {
        url = baseHref + url;
      }
      return originalFn.apply(window.history, [state, unused, url]);
    };
  }

  if (false) {
    const baseHref = window.location.href;
    window.history.replaceState = patchHistoryStateFunctionForAngular(window.history.replaceState, baseHref);
    window.history.pushState = patchHistoryStateFunctionForAngular(window.history.pushState, baseHref);
  }

  const originalWebSocket = window.WebSocket;
  class ProxiedWebSocket extends EventTarget {
    /**
     * @param {string} url The url of the websocket.
     * @param {Object!} protocols The protocols of the websocket.
     */
    constructor(url, protocols) {
      super();
      this.url = url;
      this.protocols = protocols;

      this.open();
    }

    /** Opens the websocket. */
    async open() {
      const hostPort = (await bootstrapChannel).port;
      const channel = new MessageChannel();
      hostPort.postMessage(
          {type: 'websocket_open', url: this.url, protocols: this.protocols},
          [channel.port2]);
      this.port = channel.port1;
      this.port.onmessage = (message) => {
        if (message.data.type === 'close') {
          const event = new CloseEvent('close', {
            code: message.data.code,
            reason: message.data.reason,
            wasClean: message.data.wasClean,
          });
          if (this.onclose) {
            this.onclose(event);
          }
          this.dispatchEvent(event);
          return;
        } else if (message.data.type === 'open') {
          const event = new Event('open');
          if (this.onopen) {
            this.onopen(event);
          }
          this.dispatchEvent(event);
          return;
        } else if (message.data.type === 'message') {
          let data = message.data.data;
          if (message.data.messageType === 'text' || message.data.messageType === 'message') {
            data = new TextDecoder().decode(data);
          }
          const event = new MessageEvent('message', {
            data,
            type: message.data.messageType,
          });
          if (this.onmessage) {
            this.onmessage(event);
          }
          this.dispatchEvent(event);
          return;
        } else if (message.data.type === 'error') {
          const event = new ErrorEvent('error', {
            message: message.data.message,
          });
          if (this.onerror) {
            this.onerror(event);
          }
          this.dispatchEvent(event);
          return;
        }
        console.error('received unknown message in frame', event.data);
      };
    }
    /**
     * @param {string|ArrayBuffer!} data The data to send.
     */
    send(data) {
      if (typeof data === 'string') {
        this.port.postMessage({type: 'send', data});
      } else {
        this.port.postMessage({type: 'send', data}, [data.buffer]);
      }
    }

    /**
     * @param {number} code The code of the close event.
     * @param {string} reason The reason of the close event.
     */
    close(code, reason) {
      this.port.postMessage({type: 'close', code, reason});
    }
  }

  /**
   * @param {string} url The url of the websocket.
   * @param {Object!} protocols The protocols of the websocket.
   * @return {WebSocket!} The websocket.
   */
  function createWebSocket(url, protocols) {
    // This should come from the bootstrap channel, but we want this to
    // work for the synchronous constructor here.
    if (url.startsWith('wss://generativelanguage.googleapis.com/')) {
      return Reflect.construct(ProxiedWebSocket, [url, protocols]);
    }
    return Reflect.construct(originalWebSocket, [url, protocols]);
  }

  Object.defineProperty(window, 'WebSocket', {
    get: function() {
      return createWebSocket;
    },
  });

  async function instrumentErrorReporting() {
    const errors = [];
    let hostPort;

    function reportError(message) {
      if (!hostPort) {
        errors.push(message);
      } else {
        hostPort.postMessage({type: 'error', message: message}, message);
      }
    }

    function serialize(args) {
      return args.map((a) => {
        if (a instanceof Error || a instanceof ErrorEvent) {
          return a.message;
        }
        if(a instanceof CloseEvent) {
          return {code: a.code, reason: a.reason, wasClean: a.wasClean};
        }
        if( a instanceof Map) {
          return JSON.parse(JSON.stringify([...a.entries()]));
        }
        if( a instanceof Set) {
          return JSON.parse(JSON.stringify([...a.values()]));
        }
        if (a instanceof Object) {
          return JSON.parse(JSON.stringify(a));
        }
        return a;
      });
    }

    const originalConsole = window.console;
    const originalConsoleLog = window.console.log;
    const originalConsoleError = window.console.error;
    const originalConsoleWarn = window.console.warn;
    const originalConsoleDebug = window.console.debug;
    window.console = {
      ...originalConsole,
      log: (message, ...args) => {
        originalConsoleLog.apply(window.console, [message, ...args]);
        const combined = serialize([message, ...args]);
        reportError({type: 'console_log', message: combined });
      },
      debug: (message, ...args) => {
        originalConsoleDebug.apply(window.console, [message, ...args]);
        const combined = serialize([message, ...args]);
        reportError({type: 'console_debug', message: combined });
      },
      error: (message, ...args) => {
        originalConsoleError.apply(window.console, [message, ...args]);
        const combined = serialize([message, ...args]);
        reportError({type: 'console_error', message: combined });
      },
      warn: (message, ...args) => {
        originalConsoleWarn.apply(window.console, [message, ...args]);
        const combined = serialize([message, ...args]);
        reportError({type: 'console_warn', message: combined });
      },
    };

    window.onerror = (message, source, lineno, colno, error) => {
      reportError({type: 'error', message: serialize([message]), source, lineno, colno, error});
    };

    window.onunhandledrejection = (event) => {
      reportError({type: 'unhandledrejection', message: serialize([event.reason])});
    };

    window.alert = (message) => {
      reportError({type: 'alert', message: serialize([message]) });
    };

    hostPort = (await bootstrapChannel).port;
    for(const error of errors) {
      hostPort.postMessage({type: 'error', message: error});
    }
  }

  const availableFiles = new Set(window.APPLET_FILES || []);

  instrumentErrorReporting();

  window.addEventListener('hashchange', async (e) =>{
    const config = await bootstrapChannel;
    const hostPort = config.port;
    hostPort.postMessage({type: 'hashchange', hash: window.location.hash});
  });

  if (true) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas-pro';
    script.onload = () => {
      window.addEventListener('message', async (event) => {
        if (event.data?.type === 'capture-screenshot') {
          try {
            const canvas = await html2canvas(document.documentElement, {
              logging: false,
              useCORS: true,
              backgroundColor: null,
              scale: 1,
            });
            const hostPort = (await bootstrapChannel).port;
            hostPort.postMessage(
              {
                type: 'screenshot-result',
                dataUrl: canvas.toDataURL('image/png'),
                requestId: event.data.requestId,
                scrollX: document.body.scrollLeft,
                scrollY: document.body.scrollTop,
              },
            );
          } catch (e) {
            const hostPort = (await bootstrapChannel).port;
            hostPort.postMessage(
              {
                type: 'screenshot-error',
                error: e.message,
                requestId: event.data.requestId,
              });
          }
        }
      });
    };
    document.head.appendChild(script);
  }
})();
// # sourceURL=iframe_shim.js