import { defaultWhiteboardColor } from "./map-editor-data";
import type {
  MapExportTemplate,
  MapExportViewport,
  Marker,
  MarkerKind,
  PlannedPointRoute,
  PointRoute,
  RouteStyle,
  TransportMode,
  WhiteboardBrush,
  WhiteboardElement,
  WhiteboardTextFontWeight,
  WhiteboardTool,
  WhiteboardWatermarkConfig,
} from "./map-editor-types";

export type CreateMapExportTemplateInput = Omit<
  MapExportTemplate,
  "app" | "exportedAt" | "version"
>;

export const MAP_TEMPLATE_SHARE_PREFIX = "NANMAP1.";

const markerKinds: MarkerKind[] = [
  "star",
  "circle",
  "circle-star",
  "circle-number",
];
const transportModes: TransportMode[] = ["drive", "transit", "ride", "walk"];
const whiteboardBrushes: WhiteboardBrush[] = ["fountain", "pencil", "crayon"];
const whiteboardTools: WhiteboardTool[] = [
  "select",
  "move",
  "pen",
  "text",
  "image",
  "eyedropper",
  "bucket",
  "erase",
];
const whiteboardTextFontWeights: WhiteboardTextFontWeight[] = [
  300,
  400,
  500,
  600,
  700,
  800,
  900,
];
const defaultWatermark: WhiteboardWatermarkConfig = {
  enabled: false,
  opacity: 0.18,
  size: 38,
  spacing: 220,
  text: "Nan Map",
  tiled: true,
};

export function createMapExportTemplate(
  input: CreateMapExportTemplateInput,
): MapExportTemplate {
  return clonePlain({
    ...input,
    app: "nan-map",
    exportedAt: new Date().toISOString(),
    version: 1,
  });
}

export function serializeMapTemplate(template: MapExportTemplate) {
  return JSON.stringify(template, null, 2);
}

export function encodeMapTemplateShareCode(template: MapExportTemplate) {
  return `${MAP_TEMPLATE_SHARE_PREFIX}${encodeBase64Url(
    serializeMapTemplate(template),
  )}`;
}

export function parseMapTemplateImportSource(source: string) {
  const jsonText = decodeImportSource(source);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("导入内容不是有效的 Nan Map 模板");
  }

  return normalizeMapTemplate(parsed);
}

export function createMapTemplateFileName(template: MapExportTemplate) {
  const date = template.exportedAt.slice(0, 10) || "export";

  return `nan-map-${date}.json`;
}

function decodeImportSource(source: string) {
  const trimmedSource = source.trim();

  if (!trimmedSource) {
    throw new Error("请先粘贴 P2P 分享码或选择模板文件");
  }

  const compactSource = trimmedSource.replace(/\s+/g, "");

  if (compactSource.startsWith(MAP_TEMPLATE_SHARE_PREFIX)) {
    return decodeBase64Url(compactSource.slice(MAP_TEMPLATE_SHARE_PREFIX.length));
  }

  return trimmedSource;
}

function normalizeMapTemplate(value: unknown): MapExportTemplate {
  const record = asRecord(value);

  if (!record || record.app !== "nan-map" || record.version !== 1) {
    throw new Error("模板来源或版本不匹配");
  }

  const markers = normalizeMarkers(record.markers);
  const markerIds = new Set(markers.map((marker) => marker.id));

  if (markers.length === 0) {
    throw new Error("模板里没有可导入的点位");
  }

  const routeConnections = normalizePointRoutes(
    record.routeConnections,
    markerIds,
  );
  const pointRouteById = new Map(
    routeConnections.map((route) => [route.id, route]),
  );
  const plannedPointRoutes = normalizePlannedPointRoutes(
    record.plannedPointRoutes,
    pointRouteById,
  );
  const routeStyles = normalizeRouteStyles(record.routeStyles, pointRouteById);
  const selectedMarkerId = getOptionalString(record.selectedMarkerId);
  const activePointRouteId = getOptionalString(record.activePointRouteId);

  return {
    app: "nan-map",
    activePointRouteId:
      activePointRouteId && pointRouteById.has(activePointRouteId)
        ? activePointRouteId
        : null,
    city: getTrimmedText(record.city, "上海", 40),
    exportedAt: getTrimmedText(
      record.exportedAt,
      new Date().toISOString(),
      40,
    ),
    markers,
    plannedPointRoutes,
    routeConnections,
    routeStyles,
    selectedMarkerId:
      selectedMarkerId && markerIds.has(selectedMarkerId)
        ? selectedMarkerId
        : markers[0].id,
    selectedRoutePlanId: getOptionalString(record.selectedRoutePlanId),
    transportMode: normalizeTransportMode(record.transportMode),
    version: 1,
    viewport: normalizeViewport(record.viewport),
    whiteboard: normalizeWhiteboard(record.whiteboard),
  };
}

function normalizeMarkers(value: unknown) {
  const usedIds = new Set<string>();

  return toArray(value).reduce<Marker[]>((markers, item, index) => {
    const record = asRecord(item);
    const lngLat = normalizeLngLat(record?.lngLat);

    if (!record || !lngLat) {
      return markers;
    }

    const id = resolveUniqueId(record.id, `marker-import-${index + 1}`, usedIds);

    markers.push({
      address: getPlainText(record.address, "", 240),
      color: normalizeColor(record.color, "#0f766e"),
      id,
      kind: normalizeMarkerKind(record.kind),
      lngLat,
      locked: Boolean(record.locked),
      name: getTrimmedText(record.name, `点位 ${index + 1}`, 80),
    });

    return markers;
  }, []);
}

function normalizePointRoutes(value: unknown, markerIds: Set<string>) {
  const usedIds = new Set<string>();

  return toArray(value).reduce<PointRoute[]>((routes, item, index) => {
    const record = asRecord(item);
    const fromMarkerId = getOptionalString(record?.fromMarkerId);
    const toMarkerId = getOptionalString(record?.toMarkerId);

    if (
      !record ||
      !fromMarkerId ||
      !toMarkerId ||
      fromMarkerId === toMarkerId ||
      !markerIds.has(fromMarkerId) ||
      !markerIds.has(toMarkerId)
    ) {
      return routes;
    }

    const exists = routes.some(
      (route) =>
        (route.fromMarkerId === fromMarkerId &&
          route.toMarkerId === toMarkerId) ||
        (route.fromMarkerId === toMarkerId &&
          route.toMarkerId === fromMarkerId),
    );

    if (exists) {
      return routes;
    }

    routes.push({
      createdAt: getFiniteNumber(record.createdAt, Date.now() + index),
      fromMarkerId,
      id: resolveUniqueId(record.id, `point-route-import-${index + 1}`, usedIds),
      toMarkerId,
    });

    return routes;
  }, []);
}

function normalizePlannedPointRoutes(
  value: unknown,
  pointRouteById: Map<string, PointRoute>,
) {
  const record = asRecord(value);
  const plannedRoutes: Record<string, PlannedPointRoute> = {};

  if (!record) {
    return plannedRoutes;
  }

  Object.entries(record).forEach(([key, item]) => {
    const itemRecord = asRecord(item);
    const routeId = getOptionalString(itemRecord?.id) ?? key;
    const pointRoute = pointRouteById.get(routeId);

    if (!itemRecord || !pointRoute) {
      return;
    }

    const mode = normalizeTransportMode(itemRecord.mode);
    const result = normalizeRoutePlanResult(itemRecord.result, mode);

    if (!result) {
      return;
    }

    const requestedPlanId = getOptionalString(itemRecord.planId);
    const planId =
      requestedPlanId &&
      result.plans.some((plan) => plan.id === requestedPlanId)
        ? requestedPlanId
        : result.plans[0]?.id ?? null;

    plannedRoutes[routeId] = {
      id: routeId,
      mode,
      planId,
      planningKey: getTrimmedText(
        itemRecord.planningKey,
        `imported:${routeId}:${mode}`,
        260,
      ),
      pointRoute,
      result,
      updatedAt: getFiniteNumber(itemRecord.updatedAt, Date.now()),
    };
  });

  return plannedRoutes;
}

function normalizeRoutePlanResult(value: unknown, mode: TransportMode) {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const resultPath = normalizeLngLatPath(record.path);
  const plans = toArray(record.plans)
    .map((plan, index) => normalizeRoutePlanOption(plan, index, resultPath))
    .filter((plan) => plan !== null);

  if (plans.length === 0 && resultPath.length >= 2) {
    plans.push({
      badge: "导入",
      cost: undefined,
      costLabel: undefined,
      distance: 0,
      duration: 0,
      id: "imported-plan",
      path: resultPath,
      steps: [],
      title: "导入线路",
      warning: undefined,
    });
  }

  if (plans.length === 0) {
    return null;
  }

  return {
    message: getPlainText(record.message, "已导入路线规划", 160),
    mode,
    path: resultPath.length >= 2 ? resultPath : plans[0].path,
    plans,
    source: "amap" as const,
  };
}

function normalizeRoutePlanOption(
  value: unknown,
  index: number,
  fallbackPath: NanMapLngLat[],
) {
  const record = asRecord(value);

  if (!record) {
    return null;
  }

  const path = normalizeLngLatPath(record.path);
  const resolvedPath = path.length >= 2 ? path : fallbackPath;

  if (resolvedPath.length < 2) {
    return null;
  }

  const cost = getOptionalFiniteNumber(record.cost);
  const warning = getOptionalString(record.warning);
  const costLabel = getOptionalString(record.costLabel);

  return {
    badge: getTrimmedText(record.badge, String(index + 1), 24),
    cost,
    costLabel: costLabel ?? undefined,
    distance: Math.max(0, Math.round(getFiniteNumber(record.distance, 0))),
    duration: Math.max(0, Math.round(getFiniteNumber(record.duration, 0))),
    id: getTrimmedText(record.id, `plan-${index + 1}`, 80),
    path: resolvedPath,
    steps: normalizeRoutePlanSteps(record.steps),
    title: getTrimmedText(record.title, `路线方案 ${index + 1}`, 80),
    warning: warning ?? undefined,
  };
}

function normalizeRoutePlanSteps(value: unknown) {
  return toArray(value).reduce<NanMapRoutePlanStep[]>((steps, item, index) => {
    const record = asRecord(item);

    if (!record) {
      return steps;
    }

    const instruction = getTrimmedText(record.instruction, "", 180);

    if (!instruction) {
      return steps;
    }

    steps.push({
      distance: getOptionalFiniteNumber(record.distance),
      duration: getOptionalFiniteNumber(record.duration),
      instruction: instruction || `步骤 ${index + 1}`,
    });

    return steps;
  }, []);
}

function normalizeRouteStyles(
  value: unknown,
  pointRouteById: Map<string, PointRoute>,
) {
  const record = asRecord(value);
  const routeStyles: Record<string, RouteStyle> = {};

  if (!record) {
    return routeStyles;
  }

  Object.entries(record).forEach(([routeId, item]) => {
    const itemRecord = asRecord(item);

    if (!itemRecord || !pointRouteById.has(routeId)) {
      return;
    }

    routeStyles[routeId] = {
      color: normalizeColor(itemRecord.color, ""),
    };
  });

  return routeStyles;
}

function normalizeWhiteboard(value: unknown) {
  const record = asRecord(value);

  return {
    activeBrush: normalizeWhiteboardBrush(record?.activeBrush),
    activeColor: normalizeColor(record?.activeColor, defaultWhiteboardColor),
    activeTool: normalizeWhiteboardTool(record?.activeTool),
    elements: normalizeWhiteboardElements(record?.elements),
    watermark: normalizeWatermark(record?.watermark),
  };
}

function normalizeWhiteboardElements(value: unknown) {
  const usedIds = new Set<string>();

  return toArray(value).reduce<WhiteboardElement[]>((elements, item, index) => {
    const record = asRecord(item);

    if (!record) {
      return elements;
    }

    const id = resolveUniqueId(
      record.id,
      `whiteboard-${index + 1}`,
      usedIds,
    );

    if (record.kind === "line") {
      const points = normalizeLngLatPath(record.points);

      if (points.length === 0) {
        return elements;
      }

      elements.push({
        brush: normalizeWhiteboardBrush(record.brush),
        color: normalizeColor(record.color, defaultWhiteboardColor),
        id,
        kind: "line",
        opacity: clamp(getFiniteNumber(record.opacity, 0.92), 0, 1),
        points,
        strokeWidth: clamp(getFiniteNumber(record.strokeWidth, 4), 1, 64),
      });
      return elements;
    }

    if (record.kind === "text") {
      const anchor = normalizeLngLat(record.anchor);

      if (!anchor) {
        return elements;
      }

      elements.push({
        anchor,
        color: normalizeColor(record.color, "#111815"),
        fontFamily: getPlainText(record.fontFamily, "Arial, Helvetica, sans-serif", 180),
        fontSize: clamp(getFiniteNumber(record.fontSize, 18), 8, 144),
        fontWeight: normalizeWhiteboardTextFontWeight(record.fontWeight),
        id,
        kind: "text",
        text: getPlainText(record.text, "新文字", 1000),
        width: clamp(getFiniteNumber(record.width, 180), 40, 900),
      });
      return elements;
    }

    if (record.kind === "image") {
      const anchor = normalizeLngLat(record.anchor);
      const src = getPlainText(record.src, "", 10_000_000);

      if (!anchor || !isSafeImageSource(src)) {
        return elements;
      }

      elements.push({
        anchor,
        height: clamp(getFiniteNumber(record.height, 160), 24, 1600),
        id,
        kind: "image",
        opacity: clamp(getFiniteNumber(record.opacity, 0.94), 0, 1),
        src,
        width: clamp(getFiniteNumber(record.width, 220), 24, 1600),
      });
    }

    return elements;
  }, []);
}

function normalizeWatermark(value: unknown): WhiteboardWatermarkConfig {
  const record = asRecord(value);

  if (!record) {
    return defaultWatermark;
  }

  return {
    enabled: Boolean(record.enabled),
    opacity: clamp(getFiniteNumber(record.opacity, defaultWatermark.opacity), 0, 1),
    size: clamp(getFiniteNumber(record.size, defaultWatermark.size), 12, 144),
    spacing: clamp(
      getFiniteNumber(record.spacing, defaultWatermark.spacing),
      80,
      720,
    ),
    text: getPlainText(record.text, defaultWatermark.text, 120),
    tiled: record.tiled === undefined ? defaultWatermark.tiled : Boolean(record.tiled),
  };
}

function normalizeViewport(value: unknown): MapExportViewport | null {
  const record = asRecord(value);
  const center = normalizeLngLat(record?.center);

  if (!record || !center) {
    return null;
  }

  return {
    center,
    zoom: clamp(getFiniteNumber(record.zoom, 13), 3, 20),
  };
}

function normalizeLngLatPath(value: unknown) {
  return toArray(value).reduce<NanMapLngLat[]>((points, point) => {
    const lngLat = normalizeLngLat(point);

    if (lngLat) {
      points.push(lngLat);
    }

    return points;
  }, []);
}

function normalizeLngLat(value: unknown): NanMapLngLat | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);

  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null;
  }

  return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
}

function normalizeMarkerKind(value: unknown): MarkerKind {
  return markerKinds.includes(value as MarkerKind)
    ? (value as MarkerKind)
    : "circle";
}

function normalizeTransportMode(value: unknown): TransportMode {
  return transportModes.includes(value as TransportMode)
    ? (value as TransportMode)
    : "drive";
}

function normalizeWhiteboardBrush(value: unknown): WhiteboardBrush {
  return whiteboardBrushes.includes(value as WhiteboardBrush)
    ? (value as WhiteboardBrush)
    : "fountain";
}

function normalizeWhiteboardTool(value: unknown): WhiteboardTool {
  return whiteboardTools.includes(value as WhiteboardTool)
    ? (value as WhiteboardTool)
    : "move";
}

function normalizeWhiteboardTextFontWeight(
  value: unknown,
): WhiteboardTextFontWeight {
  return whiteboardTextFontWeights.includes(value as WhiteboardTextFontWeight)
    ? (value as WhiteboardTextFontWeight)
    : 400;
}

function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const color = value.trim();

  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)
    ? color
    : fallback;
}

function isSafeImageSource(value: string) {
  return (
    value.startsWith("data:image/") ||
    value.startsWith("https://") ||
    value.startsWith("http://")
  );
}

function resolveUniqueId(
  value: unknown,
  fallback: string,
  usedIds: Set<string>,
) {
  const baseId = getTrimmedText(value, fallback, 120).replace(/\s+/g, "-");
  let id = baseId;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(id);
  return id;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getTrimmedText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim().slice(0, maxLength);

  return text || fallback;
}

function getPlainText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function getFiniteNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getOptionalFiniteNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function encodeBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  const chunks: string[] = [];
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(
      String.fromCharCode(...bytes.slice(index, index + chunkSize)),
    );
  }

  return btoa(chunks.join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  try {
    const normalizedValue = value.replaceAll("-", "+").replaceAll("_", "/");
    const paddingLength = (4 - (normalizedValue.length % 4)) % 4;
    const binary = atob(`${normalizedValue}${"=".repeat(paddingLength)}`);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );

    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error("P2P 分享码无法解析");
  }
}
