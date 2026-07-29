'use client';

import { Button } from '@/components/ui/button';
import { Volume2 } from 'lucide-react';

interface SpeechButtonProps {
  text?: string;
  size?: string;
  disabled?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onTranscription?: (text: string) => void;
  className?: string;
  children?: React.ReactNode;
}

export function SpeechButton({
  text,
  size: _size,
  disabled,
  onStart,
  onEnd,
  onTranscription: _onTranscription,
  className,
  children,
}: SpeechButtonProps) {
  const handleSpeak = () => {
    if (disabled) return;
    if (!text || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleSpeak}
      className={className}
      disabled={disabled}
      title="朗读"
    >
      {children || <Volume2 className="h-4 w-4" />}
    </Button>
  );
}
