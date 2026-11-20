// Shared by the live preview and the browser STL exporter. Units are millimeters.
export function verticalLayout(settings) {
  const faceHeight = settings.height / 2 - settings.wall - 2;
  return {
    upperLevel: settings.height / 2,
    faceHeight,
    trayHeight: Math.min(faceHeight, Math.max(4.4, faceHeight - 6)),
  };
}

export function railLimits(settings) {
  const { upperLevel, trayHeight } = verticalLayout(settings);
  return {
    projection: Math.min(20, Math.floor((settings.width - 2 * settings.wall - 1)) / 2),
    thickness: Math.min(7, Math.floor((upperLevel - settings.wall - trayHeight - 1) * 2) / 2),
  };
}

export function gripLayout(width, height) {
  const radius = Math.min(4, height / 4, width / 12);
  const halfSpan = Math.min(28, (width - 2 * radius - 2) / 2);
  return {
    radius,
    left: width / 2 - halfSpan,
    right: width / 2 + halfSpan,
    bottom: height - Math.min(14, height - 3) + radius,
  };
}
