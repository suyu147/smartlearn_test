'use client';

import type { PPTElement, PPTElementFill } from '@/lib/types/slides';

interface ScreenElementProps {
  element: PPTElement;
  contentHeight?: number;
}

function isFillObject(fill: unknown): fill is PPTElementFill {
  return typeof fill === 'object' && fill !== null && 'type' in fill;
}

function resolveCssFill(fill: unknown): React.CSSProperties {
  if (!fill) return {};

  if (typeof fill === 'string') {
    return { backgroundColor: fill };
  }

  if (!isFillObject(fill)) return {};

  switch (fill.type) {
    case 'solid':
      return fill.color ? { backgroundColor: fill.color } : {};
    case 'gradient':
      if (!fill.gradient?.colors?.length) return {};
      return {
        background: `linear-gradient(${fill.gradient.direction ?? 180}deg, ${fill.gradient.colors.join(', ')})`,
      };
    case 'image':
      return fill.src
        ? {
            backgroundImage: `url(${fill.src})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }
        : {};
    default:
      return {};
  }
}

function resolveShapeFill(fill: unknown): string | undefined {
  if (typeof fill === 'string') return fill;
  if (!isFillObject(fill)) return undefined;
  return fill.type === 'solid' ? fill.color : undefined;
}

export function ScreenElement({ element, contentHeight: _contentHeight }: ScreenElementProps) {
  const el = element as Record<string, unknown>;

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: element.left,
    top: element.top,
    width: element.width,
    height: element.height,
    transform: element.rotate ? `rotate(${element.rotate}deg)` : undefined,
    opacity: element.opacity ?? 1,
    zIndex: typeof el.order === 'number' ? (el.order as number) : undefined,
  };

  switch (element.type) {
    case 'text': {
      const content = String(el.content || '');
      const defaultColor = el.defaultColor as string | undefined;
      const defaultFontName = el.defaultFontName as string | undefined;
      const lineHeight = el.lineHeight as number | string | undefined;
      const textAlign = el.textAlign as React.CSSProperties['textAlign'];
      const fontSize = el.fontSize as number | string | undefined;
      const verticalAlign = el.verticalAlign as React.CSSProperties['alignItems'];
      const fillStyle = resolveCssFill(el.fill);

      return (
        <div
          style={{
            ...baseStyle,
            ...fillStyle,
            minHeight: element.height,
            height: element.height,
            color: defaultColor || '#333333',
            fontFamily: defaultFontName || 'Microsoft YaHei, sans-serif',
            lineHeight: lineHeight || 1.5,
            textAlign: textAlign || 'left',
            overflow: 'visible',
            wordBreak: 'break-word',
            boxSizing: 'border-box',
            fontSize: fontSize || undefined,
            whiteSpace: 'pre-wrap',
            verticalAlign: verticalAlign || 'top',
          }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );
    }

    case 'image': {
      const src = String(el.src || '');
      const alt = String(el.alt || '');
      const isPlaceholder = /^gen_(img|vid)_[\w-]+$/i.test(src);
      const isValidSrc = src && !isPlaceholder && (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/'));
      const objectFit = (el.objectFit as React.CSSProperties['objectFit']) || 'contain';
      return (
        <div style={baseStyle}>
          {isValidSrc ? (
            <img
              src={src}
              alt={alt}
              style={{ width: '100%', height: '100%', objectFit }}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center border border-dashed border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
              <span className="text-xs text-gray-400">图片</span>
            </div>
          )}
        </div>
      );
    }

    case 'shape': {
      const path = el.path as string | undefined;
      const rawViewBox = el.viewBox as number[] | string | undefined;
      const fillStyle = resolveCssFill(el.fill);
      const svgFill = resolveShapeFill(el.fill) || '#5b9bd5';
      const outline = el.outline as { color?: string; width?: number; style?: string } | undefined;
      const viewBox = Array.isArray(rawViewBox)
        ? rawViewBox
        : typeof rawViewBox === 'string'
          ? rawViewBox.split(' ').slice(2).map(Number)
          : undefined;

      if (path) {
        const vb = viewBox && viewBox.length >= 2 ? viewBox : [element.width, element.height];
        return (
          <div style={{ ...baseStyle, ...fillStyle }}>
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 ${vb[0]} ${vb[1]}`}
              preserveAspectRatio="none"
            >
              <path
                d={path}
                fill={svgFill}
                stroke={outline?.color || 'none'}
                strokeWidth={outline?.width || 0}
              />
            </svg>
          </div>
        );
      }

      return (
        <div
          style={{
            ...baseStyle,
            ...fillStyle,
            borderRadius: (el.borderRadius as number | undefined) || undefined,
            border: outline ? `${outline.width || 1}px ${outline.style || 'solid'} ${outline.color || '#333'}` : undefined,
          }}
        />
      );
    }

    case 'latex': {
      const html = el.html as string | undefined;
      const latexStr = el.latex as string | undefined;
      const color = el.color as string | undefined;

      return (
        <div
          style={{
            ...baseStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            color: color || '#333333',
          }}
          dangerouslySetInnerHTML={{
            __html: html || (latexStr ? `\\(${latexStr}\\)` : ''),
          }}
        />
      );
    }

    case 'chart': {
      return (
        <div
          style={{
            ...baseStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb',
            borderRadius: 4,
          }}
        >
          <span className="text-xs text-gray-400">图表</span>
        </div>
      );
    }

    case 'table': {
      const data = el.data as { rows?: number; cols?: number; cells?: unknown[][] } | undefined;
      if (!data?.cells) {
        return (
          <div style={{ ...baseStyle, overflow: 'auto' }}>
            <span className="text-xs text-gray-400">表格</span>
          </div>
        );
      }

      return (
        <div style={{ ...baseStyle, overflow: 'auto', padding: '4px' }}>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {data.cells.map((row, ri) => (
                <tr key={ri}>
                  {(row as Record<string, unknown>[]).map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-gray-300 px-2 py-1"
                      colSpan={(cell as { colspan?: number }).colspan}
                      rowSpan={(cell as { rowspan?: number }).rowspan}
                    >
                      {String((cell as { text?: string }).text || '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'video': {
      const src = String(el.src || '');
      const poster = el.poster as string | undefined;
      return (
        <div style={baseStyle}>
          <video
            src={src}
            poster={poster}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            controls
          />
        </div>
      );
    }

    case 'line': {
      const start = el.start as number[] | undefined;
      const end = el.end as number[] | undefined;
      const color = String(el.color || '#333333');
      const lineWidth = Number(el.lineWidth || el.width && 2);
      const lineStyle = el.lineStyle || el.style;

      const dashArray =
        lineStyle === 'dashed' ? '8,4' :
        lineStyle === 'dotted' ? '2,4' : 'none';

      return (
        <svg
          style={{ ...baseStyle, overflow: 'visible' }}
          width={element.width}
          height={element.height}
        >
          <line
            x1={start?.[0] ?? 0}
            y1={start?.[1] ?? 0}
            x2={end?.[0] ?? element.width}
            y2={end?.[1] ?? element.height}
            stroke={color}
            strokeWidth={lineWidth}
            strokeDasharray={dashArray}
          />
        </svg>
      );
    }

    default:
      return <div style={baseStyle} />;
  }
}
