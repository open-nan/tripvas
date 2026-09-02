"use client";

import { useEffect, useRef, useState } from "react";

export type MarkerKind = NanMapMarkerKind;
export type MapLayerMarker = NanMapLayerMarker;
export type MapRoutePlanMode = NanMapRoutePlanMode;
export type MapRoutePlanStep = NanMapRoutePlanStep;
export type MapPlaceSearchResult = NanMapPlaceSearchResult;
export type MapPlaceSearchResponse = NanMapPlaceSearchResponse;
export type MapRoutePlanOption = NanMapRoutePlanOption;
export type MapRoutePlanResult = NanMapRoutePlanResult;
export type MapRouteOverlay = NanMapRouteOverlay;

type MapViewportPadding = NanMapViewportPadding;

/**
 * 高德地图渲染层的组件接口。
 *
 * MapLayer 只负责加载 public/map.js、创建地图实例、同步点位/定位覆盖物，
 * 并把高德地图事件转成 React 回调；业务状态仍由 MapEditor 统一持有。
 */
type MapLayerProps = {
  /** 当前需要优先聚焦的路线 id；为空时按点位和全部路线适配视野。 */
  focusedRouteId?: string | null;
  /** 需要绘制到高德地图上的全部点位。 */
  markers: MapLayerMarker[];
  /** 地图空白处点击回调；当前业务不通过点击改变点位位置，仅保留扩展能力。 */
  onMapClick?: (lngLat: NanMapLngLat) => void;
  /** 地图桥接层加载或销毁后的就绪状态回调。 */
  onReadyChange?: (ready: boolean) => void;
  /** 当前路线的视野适配 key；变化时会触发地图重新 fitView。 */
  routeFitKey?: string | null;
  /** 当前需要保留在地图上的全部已规划路线。 */
  routes?: MapRouteOverlay[];
  /** 当前选中的点位 id，用于高德 Marker 选中态渲染。 */
  selectedMarkerId: string;
  /** 点位拖动结束后触发，把最终经纬度回写给 React 状态。 */
  onMarkerMove: (markerId: string, lngLat: NanMapLngLat) => void;
  /** 用户点击高德路线覆盖物时触发，用于打开路线详情面板。 */
  onRouteClick: (routeId?: string) => void;
  /** 用户点击点位 Marker 时触发，只负责选中点位。 */
  onSelectMarker: (markerId: string) => void;
  /** 用户当前位置坐标；为空时会清除定位覆盖物。 */
  userLocation?: NanMapLngLat | null;
  /** 用户定位精度半径，单位米；地图层会把它绘制成精度圈。 */
  userLocationAccuracy?: number;
  /** 地图自适应视野边距，避免点位或路线被面板遮挡。 */
  viewportPadding?: MapViewportPadding;
};

/**
 * 地图加载状态浮层的组件接口。
 */
type MapLayerStatusProps = {
  /** 当前地图加载或错误状态文案。 */
  message: string;
};

const MAP_SCRIPT_SRC = "/map.js?v=route-focus-20260902";
const SHANGHAI_CENTER: NanMapLngLat = [121.4737, 31.2304];
const DEFAULT_VIEWPORT_PADDING: MapViewportPadding = [96, 128, 96, 456];

let mapScriptPromise: Promise<NanMapBridge> | undefined;
let mapEffectVersion = 0;

export function MapLayer({
  focusedRouteId = null,
  markers,
  routeFitKey = null,
  routes = [],
  selectedMarkerId,
  onMapClick,
  onMarkerMove,
  onReadyChange,
  onRouteClick,
  onSelectMarker,
  userLocation = null,
  userLocationAccuracy,
  viewportPadding = DEFAULT_VIEWPORT_PADDING,
}: MapLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const didFitViewRef = useRef(false);
  const mapBridgeRef = useRef<NanMapBridge | null>(null);
  const markerCountRef = useRef(markers.length);
  const routeFitKeyRef = useRef<string | null>(null);
  const viewportPaddingKeyRef = useRef("");
  const onMapClickRef = useRef(onMapClick);
  const onMarkerMoveRef = useRef(onMarkerMove);
  const onReadyChangeRef = useRef(onReadyChange);
  const onRouteClickRef = useRef(onRouteClick);
  const onSelectMarkerRef = useRef(onSelectMarker);
  const initialCenterRef = useRef(markers[0]?.lngLat ?? SHANGHAI_CENTER);
  const [status, setStatus] = useState<"error" | "loading" | "ready">(
    "loading",
  );
  const [message, setMessage] = useState("正在加载地图接口");

  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onMarkerMoveRef.current = onMarkerMove;
    onReadyChangeRef.current = onReadyChange;
    onRouteClickRef.current = onRouteClick;
    onSelectMarkerRef.current = onSelectMarker;
  }, [onMapClick, onMarkerMove, onReadyChange, onRouteClick, onSelectMarker]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let cancelled = false;
    const effectVersion = ++mapEffectVersion;

    ensureMapScript()
      .then(async (mapBridge) => {
        const container = containerRef.current;

        if (!container || cancelled || effectVersion !== mapEffectVersion) {
          return;
        }

        const mapInstance = await mapBridge.create(container, {
          center: initialCenterRef.current,
          mapStyle: "amap://styles/normal",
          zoom: 13,
        });

        if (cancelled || effectVersion !== mapEffectVersion) {
          mapBridge.destroy(mapInstance);
          return;
        }

        mapBridgeRef.current = mapBridge;
        setStatus("ready");
        onReadyChangeRef.current?.(true);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setMessage(getErrorMessage(error));
        onReadyChangeRef.current?.(false);
      });

    return () => {
      cancelled = true;

      if (effectVersion === mapEffectVersion) {
        mapEffectVersion += 1;
        mapBridgeRef.current?.setInteractionHandlers?.();
        mapBridgeRef.current?.destroy();
        mapBridgeRef.current = null;
        onReadyChangeRef.current?.(false);
      }
    };
  }, []);

  useEffect(() => {
    if (status !== "ready") {
      return;
    }

    const mapBridge = mapBridgeRef.current ?? window.map;

    if (!mapBridge) {
      setStatus("error");
      setMessage("public/map.js 未暴露 window.map");
      return;
    }

    let errorTimeoutId: number | undefined;
    const viewportPaddingKey = viewportPadding.join(":");
    const currentMapClickHandler = onMapClickRef.current;

    try {
      mapBridge.setInteractionHandlers?.({
        onMapClick: currentMapClickHandler
          ? (lngLat) => currentMapClickHandler(lngLat)
          : undefined,
        onRouteClick: (routeId) => onRouteClickRef.current(routeId),
      });
      mapBridge.setMarkers(markers, {
        onMarkerDragEnd: (markerId, lngLat) =>
          onMarkerMoveRef.current(markerId, lngLat),
        selectedMarkerId,
        onMarkerClick: (markerId) => onSelectMarkerRef.current(markerId),
      });
      if (mapBridge.setRoutes) {
        mapBridge.setRoutes(routes, {
          fitView: false,
          padding: viewportPadding,
        });
      } else if (routes[0]) {
        mapBridge.setRoute(routes[0].path, {
          fitView: false,
          color: routes[0].color,
          mode: routes[0].mode,
          padding: viewportPadding,
          selected: routes[0].selected,
        });
      } else {
        mapBridge.clearRoute?.();
      }
      mapBridge.setUserLocation?.(userLocation, {
        accuracy: userLocationAccuracy,
      });

      const shouldFitRoute =
        routeFitKey !== null && routeFitKeyRef.current !== routeFitKey;
      const shouldFitViewport =
        viewportPaddingKeyRef.current !== viewportPaddingKey;

      if (shouldFitRoute) {
        mapBridge.fitView({
          padding: viewportPadding,
          routeId: focusedRouteId,
        });
        didFitViewRef.current = true;
        markerCountRef.current = markers.length;
      } else if (
        !didFitViewRef.current ||
        markerCountRef.current !== markers.length ||
        shouldFitViewport
      ) {
        mapBridge.fitView({ padding: viewportPadding });
        didFitViewRef.current = true;
        markerCountRef.current = markers.length;
      } else if (routeFitKey === null) {
        mapBridge.focusMarker?.(selectedMarkerId);
      }

      routeFitKeyRef.current = routeFitKey;
      viewportPaddingKeyRef.current = viewportPaddingKey;
    } catch {
      errorTimeoutId = window.setTimeout(() => {
        setStatus("error");
        setMessage("高德地图覆盖物渲染失败，请检查标记点数据");
      }, 0);
    }

    return () => {
      if (errorTimeoutId) {
        window.clearTimeout(errorTimeoutId);
      }
    };
  }, [
    focusedRouteId,
    markers,
    routes,
    routeFitKey,
    selectedMarkerId,
    status,
    userLocation,
    userLocationAccuracy,
    viewportPadding,
  ]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        ref={containerRef}
        className={`amap-layer ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden={status !== "ready"}
      />

      {status !== "ready" && <MapLayerStatus message={message} />}
    </div>
  );
}

export default MapLayer;

function ensureMapScript() {
  if (window.map) {
    return Promise.resolve(window.map);
  }

  if (mapScriptPromise) {
    return mapScriptPromise;
  }

  mapScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-nan-map]",
    );

    if (existingScript) {
      attachScriptResolution(existingScript, resolve, reject);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.nanMap = "true";
    script.src = MAP_SCRIPT_SRC;
    attachScriptResolution(script, resolve, reject);
    document.head.appendChild(script);
  });

  return mapScriptPromise;
}

function attachScriptResolution(
  script: HTMLScriptElement,
  resolve: (mapBridge: NanMapBridge) => void,
  reject: (error: Error) => void,
) {
  if (window.map) {
    resolve(window.map);
    return;
  }

  script.addEventListener(
    "load",
    () => {
      if (window.map) {
        resolve(window.map);
        return;
      }

      reject(new Error("public/map.js 未暴露 window.map"));
    },
    { once: true },
  );
  script.addEventListener(
    "error",
    () => reject(new Error("public/map.js 加载失败")),
    { once: true },
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "高德地图加载失败";
}

function MapLayerStatus({ message }: MapLayerStatusProps) {
  return (
    <div className="map-status-card">
      <strong>地图层</strong>
      <span>{message}</span>
    </div>
  );
}
