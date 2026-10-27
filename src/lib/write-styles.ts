export type WriteStyle = {
  paragraphFont: string;
  paragraphSize: number;
  paragraphBold: boolean;
  paragraphItalic: boolean;
  lineHeight: number;
  spaceAfter: number;
};
export const defaultWriteStyles: Record<string, WriteStyle> = {
  Normal: {
    paragraphFont: "Noto Sans",
    paragraphSize: 12,
    paragraphBold: false,
    paragraphItalic: false,
    lineHeight: 1.5,
    spaceAfter: 8,
  },
  Title: {
    paragraphFont: "Noto Serif",
    paragraphSize: 28,
    paragraphBold: true,
    paragraphItalic: false,
    lineHeight: 1.2,
    spaceAfter: 18,
  },
  Subtitle: {
    paragraphFont: "Noto Sans",
    paragraphSize: 16,
    paragraphBold: false,
    paragraphItalic: false,
    lineHeight: 1.3,
    spaceAfter: 12,
  },
  Quote: {
    paragraphFont: "Noto Serif",
    paragraphSize: 12,
    paragraphBold: false,
    paragraphItalic: true,
    lineHeight: 1.5,
    spaceAfter: 10,
  },
  Caption: {
    paragraphFont: "Noto Sans",
    paragraphSize: 10,
    paragraphBold: false,
    paragraphItalic: true,
    lineHeight: 1.3,
    spaceAfter: 8,
  },
  Code: {
    paragraphFont: "Noto Sans Mono",
    paragraphSize: 10,
    paragraphBold: false,
    paragraphItalic: false,
    lineHeight: 1.3,
    spaceAfter: 8,
  },
  Bibliography: {
    paragraphFont: "Noto Serif",
    paragraphSize: 12,
    paragraphBold: false,
    paragraphItalic: false,
    lineHeight: 1.5,
    spaceAfter: 12,
  },
};
