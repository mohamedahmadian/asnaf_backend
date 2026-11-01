let jimp: Promise<typeof import('jimp')> | undefined;

export function loadJimp() {
  jimp ??= import('jimp');
  return jimp;
}
