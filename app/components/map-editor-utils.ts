import type { MapRoutePlanOption, MapViewportPadding, PlaceSuggestion } from "./map-editor-types";
import { defaultMapViewportPadding } from "./map-editor-data";

export function formatLngLat(lngLat: [number, number]) {
  return `${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}`;
}

export function formatPlaceAddress(place: PlaceSuggestion) {
  return [place.city, place.district, place.address]
    .filter(Boolean)
    .join(" · ");
}

export function formatDistanceMeters(distanceMeters: number) {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

export function formatDurationSeconds(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;

    return restMinutes > 0 ? `${hours}h ${restMinutes}min` : `${hours}h`;
  }

  return `${minutes} min`;
}

export function formatRouteCost(option: MapRoutePlanOption) {
  if (typeof option.cost === "number") {
    return option.cost <= 0 ? "¥0" : `约 ¥${Math.round(option.cost)}`;
  }

  return "--";
}

export function getRoutePlanningErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "高德路线规划失败，请稍后重试";
}

export function getPlaceSearchErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "高德地点搜索失败，请稍后重试";
}

export function getDistanceMeters(from: [number, number], to: [number, number]) {
  const earthRadius = 6_371_000;
  const fromLat = toRadians(from[1]);
  const toLat = toRadians(to[1]);
  const latDelta = toRadians(to[1] - from[1]);
  const lngDelta = toRadians(to[0] - from[0]);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getLocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return "定位权限被拒绝，请在浏览器中允许定位后重试";
  }

  if (error.code === error.POSITION_UNAVAILABLE) {
    return "暂时无法获取当前位置，请检查系统定位或网络";
  }

  if (error.code === error.TIMEOUT) {
    return "定位请求超时，请稍后重试";
  }

  return "定位失败，请稍后重试";
}

export function getPanelAwareMapPadding(isPanelCollapsed: boolean): MapViewportPadding {
  if (typeof window === "undefined") {
    return defaultMapViewportPadding;
  }

  const isSmallScreen = window.matchMedia("(max-width: 767px)").matches;

  if (isSmallScreen) {
    return isPanelCollapsed
      ? [84, 76, 96, 76]
      : [84, 76, Math.min(Math.round(window.innerHeight * 0.64) + 140, 700), 76];
  }

  return isPanelCollapsed ? [96, 128, 96, 120] : defaultMapViewportPadding;
}

export function isSamePadding(
  currentPadding: MapViewportPadding,
  nextPadding: MapViewportPadding,
) {
  return currentPadding.every((value, index) => value === nextPadding[index]);
}
