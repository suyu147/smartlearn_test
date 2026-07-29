import type { SlideBackground } from '@/lib/types/slides';

export function useSlideBackgroundStyle(background?: SlideBackground): {
  backgroundStyle: React.CSSProperties;
} {
  if (!background) {
    return { backgroundStyle: { backgroundColor: '#ffffff' } };
  }

  switch (background.type) {
    case 'solid':
      return {
        backgroundStyle: {
          backgroundColor: background.color || '#ffffff',
        },
      };
    case 'gradient': {
      if (!background.gradient) {
        return { backgroundStyle: { backgroundColor: '#ffffff' } };
      }
      const { gradient } = background;
      const colorStops = gradient.colors
        .map((c) => `${c.color} ${c.pos * 100}%`)
        .join(', ');
      const direction = gradient.rotate
        ? `${gradient.rotate}deg`
        : '180deg';
      const gradientType = gradient.type === 'radial' ? 'radial-gradient' : 'linear-gradient';
      return {
        backgroundStyle: {
          background: `${gradientType}(${gradientType === 'linear-gradient' ? direction : 'circle' }, ${colorStops})`,
        },
      };
    }
    case 'image':
      return {
        backgroundStyle: {
          backgroundImage: background.src ? `url(${background.src})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        },
      };
    default:
      return { backgroundStyle: { backgroundColor: '#ffffff' } };
  }
}
