// ANSI color helpers for the brokenigloo CLI
// Supports NO_COLOR env var for accessibility

const NO_COLOR = !!process.env.NO_COLOR;

const wrap = (code: string, text: string): string =>
  NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;

// Basic colors
export const red = (t: string) => wrap("31", t);
export const green = (t: string) => wrap("32", t);
export const yellow = (t: string) => wrap("33", t);
export const blue = (t: string) => wrap("34", t);
export const magenta = (t: string) => wrap("35", t);
export const cyan = (t: string) => wrap("36", t);
export const white = (t: string) => wrap("37", t);
export const gray = (t: string) => wrap("90", t);

// Bright colors
export const brightRed = (t: string) => wrap("91", t);
export const brightGreen = (t: string) => wrap("92", t);
export const brightYellow = (t: string) => wrap("93", t);
export const brightBlue = (t: string) => wrap("94", t);
export const brightMagenta = (t: string) => wrap("95", t);
export const brightCyan = (t: string) => wrap("96", t);

// Styles
export const bold = (t: string) => wrap("1", t);
export const dim = (t: string) => wrap("2", t);
export const italic = (t: string) => wrap("3", t);
export const underline = (t: string) => wrap("4", t);
export const inverse = (t: string) => wrap("7", t);

// Sui brand blue (#4DA2FF) - approximated in ANSI
export const suiBlue = (t: string) =>
  NO_COLOR ? t : `\x1b[38;2;77;162;255m${t}\x1b[0m`;

// Background
export const bgBlue = (t: string) => wrap("44", t);
export const bgCyan = (t: string) => wrap("46", t);
export const bgGreen = (t: string) => wrap("42", t);
export const bgRed = (t: string) => wrap("41", t);
export const bgYellow = (t: string) => wrap("43", t);

// Gradient: apply a gradient across characters using RGB
export function gradient(text: string, startRGB: [number, number, number], endRGB: [number, number, number]): string {
  if (NO_COLOR) return text;
  const chars = text.split("");
  return chars
    .map((char, i) => {
      const ratio = chars.length > 1 ? i / (chars.length - 1) : 0;
      const r = Math.round(startRGB[0] + (endRGB[0] - startRGB[0]) * ratio);
      const g = Math.round(startRGB[1] + (endRGB[1] - startRGB[1]) * ratio);
      const b = Math.round(startRGB[2] + (endRGB[2] - startRGB[2]) * ratio);
      return `\x1b[38;2;${r};${g};${b}m${char}`;
    })
    .join("") + "\x1b[0m";
}

// Sui gradient: blue to cyan
export const suiGradient = (t: string) => gradient(t, [77, 162, 255], [0, 224, 255]);

// Utility: insight box
export function insightBox(title: string, lines: string[]): string {
  const width = 56;
  const border = "─".repeat(width);
  const titleLine = `┌${border}┐`;
  const bottomLine = `└${border}┘`;
  const titlePadded = ` ${title}`.padEnd(width);

  const body = lines.map((line) => {
    const padded = ` ${line}`.padEnd(width);
    return `│${padded}│`;
  });

  return [
    titleLine,
    `│${bold(titlePadded)}│`,
    `├${border}┤`,
    ...body,
    bottomLine,
  ].join("\n");
}

// Utility: convert string to kebab-case slug
export function toKebabSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Utility: pad footer with timestamp
export function padFooter(text: string): string {
  const cols = process.stdout.columns || 80;
  const timestamp = new Date().toLocaleTimeString();
  const pad = cols - text.length - timestamp.length - 2;
  return `${text}${" ".repeat(Math.max(pad, 1))}${dim(timestamp)}`;
}
