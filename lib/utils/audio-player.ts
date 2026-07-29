export interface AudioPlayer {
  play: (id: string, url?: string) => Promise<boolean>;
  onEnded: (callback: () => void) => void;
  stop: () => void;
  isPlaying: () => boolean;
}

export function createAudioPlayer(): AudioPlayer {
  let playing = false;
  let onEndedCallback: (() => void) | null = null;

  return {
    play(id, url) {
      return new Promise((resolve) => {
        if (!window.speechSynthesis) {
          resolve(false);
          return;
        }

        window.speechSynthesis.cancel();

        const text = url || id;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;

        utterance.onstart = () => { playing = true; };
        utterance.onend = () => {
          playing = false;
          onEndedCallback?.();
        };
        utterance.onerror = () => {
          playing = false;
          onEndedCallback?.();
        };

        window.speechSynthesis.speak(utterance);
        resolve(true);
      });
    },
    onEnded(callback) {
      onEndedCallback = callback;
    },
    stop() {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      playing = false;
    },
    isPlaying: () => playing,
  };
}
