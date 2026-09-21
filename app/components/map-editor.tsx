"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  defaultMapViewportPadding,
  defaultMapCenter,
  defaultWhiteboardColor,
  geolocationOptions,
  initialMarkers,
} from "./map-editor-data";
import { EditorPanel } from "./editor-panel";
import { FloatingActions } from "./floating-actions";
import MapLayer from "./map-layer";
import type {
  LocationStatus,
  ImportExportPanelView,
  MapExportViewport,
  MapRouteOverlay,
  MapViewportPadding,
  Marker,
  PanelMode,
  PlannedPointRoute,
  PointRoute,
  PointRouteEndpoints,
  RouteConnectionSummary,
  RoutePlanningState,
  RouteStyle,
  TransportMode,
  UserLocation,
  WhiteboardBrush,
  WhiteboardElement,
  WhiteboardTool,
  WhiteboardWatermarkConfig,
} from "./map-editor-types";
import {
  createMapExportTemplate,
  createMapTemplateFileName,
  encodeMapTemplateShareCode,
  parseMapTemplateImportSource,
  serializeMapTemplate,
} from "./map-template";
import {
  getLocationErrorMessage,
  getPanelAwareMapPadding,
  getRoutePlanningErrorMessage,
  isSamePadding,
} from "./map-editor-utils";
import { WhiteboardLayer } from "./whiteboard-layer";
import { WhiteboardToolbar } from "./whiteboard-toolbar";

function findPointRouteConnection(
  routes: PointRoute[],
  firstMarkerId: string,
  secondMarkerId: string,
) {
  return (
    routes.find(
      (route) =>
        (route.fromMarkerId === firstMarkerId &&
          route.toMarkerId === secondMarkerId) ||
        (route.fromMarkerId === secondMarkerId &&
          route.toMarkerId === firstMarkerId),
    ) ?? null
  );
}

function createPointRoute(sourceMarkerId: string, targetMarkerId: string) {
  const createdAt = Date.now();

  return {
    id: `point-route-${createdAt}-${sourceMarkerId}-${targetMarkerId}`,
    createdAt,
    fromMarkerId: sourceMarkerId,
    toMarkerId: targetMarkerId,
  };
}

function isPointRouteConnectionMatch(route: PointRoute, targetRoute: PointRoute) {
  return (
    route.id === targetRoute.id ||
    route.createdAt === targetRoute.createdAt ||
    ((route.fromMarkerId === targetRoute.fromMarkerId &&
      route.toMarkerId === targetRoute.toMarkerId) ||
      (route.fromMarkerId === targetRoute.toMarkerId &&
        route.toMarkerId === targetRoute.fromMarkerId))
  );
}

function getSelectedRoutePlan(
  result: NanMapRoutePlanResult,
  planId: string | null,
) {
  return (
    (planId
      ? result.plans.find((plan) => plan.id === planId) ?? null
      : null) ??
    result.plans[0] ??
    null
  );
}

function getCurrentMapViewport() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.map?.getViewport?.() ?? null;
}

/**
 * 地图编辑器顶层组件。
 *
 * 当前不接收外部 props，负责集中持有地图点位、路线、定位、面板和白板工具状态，
 * 再把必要状态拆分传给下层组件。
 */
export default function MapEditor() {
  const [markers, setMarkers] = useState<Marker[]>(initialMarkers);
  const [selectedMarkerId, setSelectedMarkerId] = useState(
    initialMarkers[0]?.id ?? "",
  );
  const [panelMode, setPanelMode] = useState<PanelMode>("marker");
  const [importExportView, setImportExportView] =
    useState<ImportExportPanelView>("export");
  const [transportMode, setTransportMode] = useState<TransportMode>("drive");
  const [city, setCity] = useState("");
  const [isLocated, setIsLocated] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [activeWhiteboardTool, setActiveWhiteboardTool] =
    useState<WhiteboardTool>("move");
  const [activeWhiteboardBrush, setActiveWhiteboardBrush] =
    useState<WhiteboardBrush>("fountain");
  const [activeWhiteboardColor, setActiveWhiteboardColor] = useState(
    defaultWhiteboardColor,
  );
  const [whiteboardElements, setWhiteboardElements] = useState<
    WhiteboardElement[]
  >([]);
  const [whiteboardWatermark, setWhiteboardWatermark] =
    useState<WhiteboardWatermarkConfig>({
      enabled: false,
      opacity: 0.18,
      size: 38,
      spacing: 220,
      text: "Nan Map",
      tiled: true,
    });
  const [whiteboardViewportVersion, setWhiteboardViewportVersion] = useState(0);
  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("idle");
  const [locationMessage, setLocationMessage] = useState("定位未开启");
  const [locationRouteTargetId, setLocationRouteTargetId] = useState<
    string | null
  >(null);
  const [pointRoute, setPointRoute] = useState<PointRoute | null>(null);
  const [routeConnections, setRouteConnections] = useState<PointRoute[]>([]);
  const [plannedPointRoutes, setPlannedPointRoutes] = useState<
    Record<string, PlannedPointRoute>
  >({});
  const [routeStyles, setRouteStyles] = useState<Record<string, RouteStyle>>(
    {},
  );
  const [routeConnectionSourceId, setRouteConnectionSourceId] = useState<
    string | null
  >(null);
  const [selectedRoutePlanId, setSelectedRoutePlanId] = useState<string | null>(
    null,
  );
  const [isRouteSelected, setIsRouteSelected] = useState(false);
  const [routeFocusVersion, setRouteFocusVersion] = useState(0);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [mapViewportSnapshot, setMapViewportSnapshot] =
    useState<MapExportViewport | null>(null);
  const [routePlanning, setRoutePlanning] = useState<RoutePlanningState>({
    key: "",
    message: "等待地图加载完成",
    result: null,
    status: "idle",
  });
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [mapViewportPadding, setMapViewportPadding] =
    useState<MapViewportPadding>(defaultMapViewportPadding);
  const isTrackingLocationRef = useRef(false);
  const hasLoadedMapCityRef = useRef(false);
  const locationWatchIdRef = useRef<number | null>(null);

  const selectedMarker = useMemo(
    () =>
      markers.find((marker) => marker.id === selectedMarkerId) ?? markers[0] ?? null,
    [markers, selectedMarkerId],
  );
  const markerNumberById = useMemo(
    () =>
      markers.reduce<Record<string, number>>((numbers, marker, index) => {
        numbers[marker.id] = index + 1;
        return numbers;
      }, {}),
    [markers],
  );
  const selectedMarkerNumber = selectedMarker
    ? markerNumberById[selectedMarker.id] ?? 1
    : 0;

  const locationRouteTarget = useMemo(
    () =>
      locationRouteTargetId
        ? markers.find((marker) => marker.id === locationRouteTargetId) ?? null
        : null,
    [locationRouteTargetId, markers],
  );

  const pointRouteEndpoints = useMemo<PointRouteEndpoints | null>(() => {
    if (!pointRoute) {
      return null;
    }

    const from =
      markers.find((marker) => marker.id === pointRoute.fromMarkerId) ?? null;
    const to =
      markers.find((marker) => marker.id === pointRoute.toMarkerId) ?? null;

    if (!from || !to) {
      return null;
    }

    return { from, to };
  }, [markers, pointRoute]);

  const routeSourcePoints = useMemo<[number, number][]>(() => {
    if (pointRouteEndpoints) {
      return [pointRouteEndpoints.from.lngLat, pointRouteEndpoints.to.lngLat];
    }

    if (isLocated && userLocation && locationRouteTarget) {
      return [userLocation.lngLat, locationRouteTarget.lngLat];
    }

    return [];
  }, [isLocated, locationRouteTarget, pointRouteEndpoints, userLocation]);

  const routeSourcePointKey = useMemo(
    () =>
      routeSourcePoints
        .map((point) => `${point[0].toFixed(6)},${point[1].toFixed(6)}`)
        .join("|"),
    [routeSourcePoints],
  );
  const activePointRouteId = pointRoute?.id ?? null;
  const plannedPointRouteForCurrentRoute = activePointRouteId
    ? plannedPointRoutes[activePointRouteId] ?? null
    : null;
  const activeRouteStyle = activePointRouteId
    ? routeStyles[activePointRouteId] ?? null
    : null;
  const routePlanningKey = useMemo(
    () =>
      [
        activePointRouteId ??
          (locationRouteTargetId ? `location:${locationRouteTargetId}` : "none"),
        transportMode,
        city.trim(),
        routeSourcePointKey,
      ].join("::"),
    [
      activePointRouteId,
      city,
      locationRouteTargetId,
      routeSourcePointKey,
      transportMode,
    ],
  );

  const hasCachedRoutePlanForCurrentRoute =
    plannedPointRouteForCurrentRoute?.planningKey === routePlanningKey;
  const routePlanForCurrentRoute =
    routePlanning.key === routePlanningKey && routePlanning.status === "ready"
      ? routePlanning.result
      : hasCachedRoutePlanForCurrentRoute
        ? plannedPointRouteForCurrentRoute.result
        : null;
  const resolvedSelectedRoutePlanId =
    selectedRoutePlanId ??
    (hasCachedRoutePlanForCurrentRoute
      ? plannedPointRouteForCurrentRoute.planId
      : null);
  const selectedRoutePlanForCurrentRoute =
    routePlanForCurrentRoute && resolvedSelectedRoutePlanId
      ? routePlanForCurrentRoute.plans.find(
          (plan) => plan.id === resolvedSelectedRoutePlanId,
        ) ?? null
      : null;
  const routePlanForMap =
    selectedRoutePlanForCurrentRoute ??
    routePlanForCurrentRoute?.plans[0] ??
    null;
  const routePlanningStatusForCurrentRoute =
    routeSourcePoints.length < 2
      ? "idle"
      : mapReadyVersion === 0
        ? "idle"
        : routePlanning.key === routePlanningKey
          ? routePlanning.status
          : hasCachedRoutePlanForCurrentRoute
            ? "ready"
            : "loading";
  const routePlanningMessageForCurrentRoute =
    routeSourcePoints.length < 2
      ? "当前没有线路规划，请先从点位右侧工具栏选择线路目标"
      : mapReadyVersion === 0
        ? "等待地图加载完成"
        : routePlanning.key === routePlanningKey
          ? routePlanning.message
          : hasCachedRoutePlanForCurrentRoute
            ? plannedPointRouteForCurrentRoute?.result.message ??
              "高德路线规划完成"
            : "正在使用高德地图规划路线";
  const routeFitKey = pointRouteEndpoints
    ? `point:${activePointRouteId}:${
        plannedPointRouteForCurrentRoute?.updatedAt ?? "pending"
      }:${routeFocusVersion}`
    : isLocated && userLocation && locationRouteTarget
      ? `location:${locationRouteTarget.id}:${routeFocusVersion}`
      : null;
  const focusedRouteId = pointRouteEndpoints
    ? activePointRouteId
    : isLocated && userLocation && locationRouteTarget
      ? `location:${locationRouteTarget.id}`
      : null;

  const mapRoutes = useMemo<MapRouteOverlay[]>(() => {
    const storedRoutes = Object.values(plannedPointRoutes)
      .sort((left, right) => left.pointRoute.createdAt - right.pointRoute.createdAt)
      .reduce<MapRouteOverlay[]>((routes, route) => {
        const selectedPlan = getSelectedRoutePlan(route.result, route.planId);

        if (!selectedPlan || selectedPlan.path.length < 2) {
          return routes;
        }

        routes.push({
          color: routeStyles[route.id]?.color,
          id: route.id,
          mode: route.mode,
          path: selectedPlan.path,
          selected: isRouteSelected && activePointRouteId === route.id,
        });

        return routes;
      }, []);
    const locationRoutePlan = routePlanForMap;

    if (
      !activePointRouteId &&
      locationRouteTarget &&
      locationRoutePlan &&
      locationRoutePlan.path.length >= 2
    ) {
      return storedRoutes.concat({
        id: `location:${locationRouteTarget.id}`,
        mode: transportMode,
        path: locationRoutePlan.path,
        selected: isRouteSelected,
      });
    }

    return storedRoutes;
  }, [
    activePointRouteId,
    isRouteSelected,
    locationRouteTarget,
    plannedPointRoutes,
    routePlanForMap,
    routeStyles,
    transportMode,
  ]);

  const routeConnectionCandidates = useMemo(
    () => {
      if (!selectedMarker) {
        return [];
      }

      return markers.filter(
        (marker) =>
          marker.id !== selectedMarker.id &&
          !findPointRouteConnection(
            routeConnections,
            selectedMarker.id,
            marker.id,
          ),
      );
    },
    [markers, routeConnections, selectedMarker],
  );

  const routeConnectionSummaries = useMemo<RouteConnectionSummary[]>(
    () =>
      routeConnections.reduce<RouteConnectionSummary[]>((summaries, route) => {
        const from =
          markers.find((marker) => marker.id === route.fromMarkerId) ?? null;
        const to =
          markers.find((marker) => marker.id === route.toMarkerId) ?? null;

        if (!from || !to) {
          return summaries;
        }

        const plannedRoute = plannedPointRoutes[route.id] ?? null;
        const selectedPlan = plannedRoute
          ? getSelectedRoutePlan(plannedRoute.result, plannedRoute.planId)
          : null;

        summaries.push({
          id: route.id,
          color: routeStyles[route.id]?.color,
          distance: selectedPlan?.distance,
          duration: selectedPlan?.duration,
          from,
          mode: plannedRoute?.mode ?? null,
          planTitle: selectedPlan?.title,
          status: plannedRoute ? "planned" : "pending",
          to,
        });

        return summaries;
      }, []),
    [markers, plannedPointRoutes, routeConnections, routeStyles],
  );

  const resolvedLocationMessage =
    locationStatus === "active" && locationRouteTarget
      ? `已生成到 ${locationRouteTarget.name} 的路线`
      : locationMessage;
  const mapExportTemplate = useMemo(
    () =>
      createMapExportTemplate({
        activePointRouteId,
        city,
        markers,
        plannedPointRoutes,
        routeConnections,
        routeStyles,
        selectedMarkerId,
        selectedRoutePlanId,
        transportMode,
        viewport: mapViewportSnapshot,
        whiteboard: {
          activeBrush: activeWhiteboardBrush,
          activeColor: activeWhiteboardColor,
          activeTool: activeWhiteboardTool,
          elements: whiteboardElements,
          watermark: whiteboardWatermark,
        },
      }),
    [
      activePointRouteId,
      activeWhiteboardBrush,
      activeWhiteboardColor,
      activeWhiteboardTool,
      city,
      mapViewportSnapshot,
      markers,
      plannedPointRoutes,
      routeConnections,
      routeStyles,
      selectedMarkerId,
      selectedRoutePlanId,
      transportMode,
      whiteboardElements,
      whiteboardWatermark,
    ],
  );
  const mapShareCode = useMemo(
    () => encodeMapTemplateShareCode(mapExportTemplate),
    [mapExportTemplate],
  );

  const openPanelMode = useCallback((nextMode: PanelMode) => {
    setPanelMode(nextMode);
    setIsPanelCollapsed(false);
  }, []);

  const clearLocationWatch = useCallback(() => {
    if (
      locationWatchIdRef.current !== null &&
      typeof navigator !== "undefined" &&
      "geolocation" in navigator
    ) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
    }

    locationWatchIdRef.current = null;
  }, []);

  const handleOpenImportPanel = useCallback(() => {
    setImportExportView("import");
    setRouteConnectionSourceId(null);
    openPanelMode("import-export");
  }, [openPanelMode]);

  const handleOpenExportPanel = useCallback(() => {
    setMapViewportSnapshot(getCurrentMapViewport());
    setImportExportView("export");
    setRouteConnectionSourceId(null);
    openPanelMode("import-export");
  }, [openPanelMode]);

  const handleDownloadMapTemplate = useCallback(() => {
    const templateText = serializeMapTemplate(mapExportTemplate);
    const blob = new Blob([templateText], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = createMapTemplateFileName(mapExportTemplate);
    anchor.click();
    URL.revokeObjectURL(url);
  }, [mapExportTemplate]);

  const handleImportMapTemplate = useCallback(
    (source: string) => {
      try {
        const template = parseMapTemplateImportSource(source);
        const selectedMarkerId =
          template.selectedMarkerId ?? template.markers[0]?.id ?? "";
        const activePointRoute =
          template.activePointRouteId
            ? template.routeConnections.find(
                (route) => route.id === template.activePointRouteId,
              ) ?? null
            : null;
        const activePlannedRoute = activePointRoute
          ? template.plannedPointRoutes[activePointRoute.id] ?? null
          : null;

        isTrackingLocationRef.current = false;
        clearLocationWatch();
        setMarkers(template.markers);
        setSelectedMarkerId(selectedMarkerId);
        setCity(template.city);
        setPointRoute(activePointRoute);
        setRouteConnections(template.routeConnections);
        setPlannedPointRoutes(template.plannedPointRoutes);
        setRouteStyles(template.routeStyles);
        setTransportMode(activePlannedRoute?.mode ?? template.transportMode);
        setSelectedRoutePlanId(
          activePlannedRoute?.planId ?? template.selectedRoutePlanId,
        );
        setRouteConnectionSourceId(null);
        setIsRouteSelected(Boolean(activePointRoute));
        setLocationRouteTargetId(null);
        setIsLocated(false);
        setUserLocation(null);
        setLocationStatus("idle");
        setLocationMessage("定位未开启");
        setActiveWhiteboardBrush(template.whiteboard.activeBrush);
        setActiveWhiteboardColor(template.whiteboard.activeColor);
        setActiveWhiteboardTool(template.whiteboard.activeTool);
        setWhiteboardElements(template.whiteboard.elements);
        setWhiteboardWatermark(template.whiteboard.watermark);
        setMapViewportSnapshot(template.viewport);
        setRoutePlanning(
          activePlannedRoute
            ? {
                key: activePlannedRoute.planningKey,
                message: activePlannedRoute.result.message,
                result: activePlannedRoute.result,
                status: "ready",
              }
            : {
                key: "",
                message: "等待地图加载完成",
                result: null,
                status: "idle",
              },
        );
        setRouteFocusVersion((currentVersion) => currentVersion + 1);
        setWhiteboardViewportVersion((currentVersion) => currentVersion + 1);
        setImportExportView("import");
        openPanelMode("import-export");

        window.setTimeout(() => {
          if (template.viewport) {
            window.map?.setViewport?.(template.viewport);
            setMapViewportSnapshot(template.viewport);
            setWhiteboardViewportVersion((currentVersion) => currentVersion + 1);
            return;
          }

          window.map?.fitView({ padding: mapViewportPadding });
          setMapViewportSnapshot(getCurrentMapViewport());
        }, 80);

        return {
          ok: true,
          message: `已导入 ${template.markers.length} 个点位、${template.routeConnections.length} 条线路和 ${template.whiteboard.elements.length} 个白板对象`,
        };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error && error.message
              ? error.message
              : "导入失败，请检查模板内容",
        };
      }
    },
    [clearLocationWatch, mapViewportPadding, openPanelMode],
  );

  const handleMapReadyChange = useCallback((ready: boolean) => {
    setMapReadyVersion((currentVersion) => (ready ? currentVersion + 1 : 0));
    setMapViewportSnapshot(ready ? getCurrentMapViewport() : null);
  }, []);

  const handleMapViewportChange = useCallback(() => {
    setWhiteboardViewportVersion((currentVersion) => currentVersion + 1);
    setMapViewportSnapshot(getCurrentMapViewport());
  }, []);

  const handleWhiteboardWatermarkChange = useCallback(
    (updates: Partial<WhiteboardWatermarkConfig>) => {
      setWhiteboardWatermark((currentConfig) => ({
        ...currentConfig,
        ...updates,
      }));
    },
    [],
  );

  const handleLocationSuccess = useCallback(
    (position: GeolocationPosition) => {
      if (!isTrackingLocationRef.current) {
        return;
      }

      setUserLocation({
        accuracy: position.coords.accuracy,
        lngLat: [position.coords.longitude, position.coords.latitude],
        updatedAt: position.timestamp,
      });
      setLocationStatus("active");
      setLocationMessage(
        `定位已开启，精度约 ${Math.round(position.coords.accuracy)} 米`,
      );
    },
    [],
  );

  const handleLocationError = useCallback(
    (error: GeolocationPositionError) => {
      isTrackingLocationRef.current = false;
      clearLocationWatch();
      setIsLocated(false);
      setUserLocation(null);
      setLocationRouteTargetId(null);
      setLocationStatus("error");
      setLocationMessage(getLocationErrorMessage(error));
    },
    [clearLocationWatch],
  );

  const stopLocationTracking = useCallback(() => {
    isTrackingLocationRef.current = false;
    clearLocationWatch();
    setIsLocated(false);
    setUserLocation(null);
    setLocationRouteTargetId(null);
    setIsRouteSelected(false);
    setSelectedRoutePlanId(null);
    setLocationStatus("idle");
    setLocationMessage("定位未开启");
  }, [clearLocationWatch]);

  const startLocationTracking = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setIsLocated(false);
      setUserLocation(null);
      setLocationRouteTargetId(null);
      setIsRouteSelected(false);
      setSelectedRoutePlanId(null);
      setLocationStatus("error");
      setLocationMessage("当前浏览器不支持定位功能");
      return;
    }

    clearLocationWatch();
    isTrackingLocationRef.current = true;
    setIsLocated(true);
    setLocationRouteTargetId(null);
    setIsRouteSelected(false);
    setSelectedRoutePlanId(null);
    setLocationStatus("locating");
    setLocationMessage("正在获取当前位置");

    try {
      locationWatchIdRef.current = navigator.geolocation.watchPosition(
        handleLocationSuccess,
        handleLocationError,
        geolocationOptions,
      );
    } catch {
      isTrackingLocationRef.current = false;
      clearLocationWatch();
      setIsLocated(false);
      setUserLocation(null);
      setLocationStatus("error");
      setLocationMessage("定位服务启动失败，请检查浏览器定位权限");
    }
  }, [clearLocationWatch, handleLocationError, handleLocationSuccess]);

  const handleToggleLocation = useCallback(() => {
    if (isLocated || locationStatus === "locating") {
      stopLocationTracking();
      return;
    }

    startLocationTracking();
  }, [isLocated, locationStatus, startLocationTracking, stopLocationTracking]);

  useEffect(() => {
    const requestTimeoutId = window.setTimeout(startLocationTracking, 0);

    return () => window.clearTimeout(requestTimeoutId);
  }, [startLocationTracking]);

  useEffect(() => {
    return () => {
      isTrackingLocationRef.current = false;
      clearLocationWatch();
    };
  }, [clearLocationWatch]);

  useEffect(() => {
    const updateViewportPadding = () => {
      const nextPadding = getPanelAwareMapPadding(isPanelCollapsed);
      setMapViewportPadding((currentPadding) =>
        isSamePadding(currentPadding, nextPadding) ? currentPadding : nextPadding,
      );
    };

    updateViewportPadding();
    window.addEventListener("resize", updateViewportPadding);

    return () => {
      window.removeEventListener("resize", updateViewportPadding);
    };
  }, [isPanelCollapsed]);

  useEffect(() => {
    if (mapReadyVersion === 0 || hasLoadedMapCityRef.current) {
      return;
    }

    let cancelled = false;
    hasLoadedMapCityRef.current = true;
    const getCurrentCity = window.map?.getCurrentCity;

    if (typeof getCurrentCity !== "function") {
      const fallbackTimeoutId = window.setTimeout(() => {
        if (!cancelled) {
          setCity((currentCity) => currentCity.trim() || "上海");
        }
      }, 0);

      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimeoutId);
      };
    }

    getCurrentCity()
      .then((nextCity) => {
        if (cancelled || !nextCity.trim()) {
          return;
        }

        setCity((currentCity) => currentCity.trim() || nextCity.trim());
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setCity((currentCity) => currentCity.trim() || "上海");
      });

    return () => {
      cancelled = true;
    };
  }, [mapReadyVersion]);

  useEffect(() => {
    if (
      routeSourcePoints.length < 2 ||
      mapReadyVersion === 0 ||
      hasCachedRoutePlanForCurrentRoute
    ) {
      return;
    }

    const planRoute = window.map?.planRoute;
    let cancelled = false;

    if (typeof planRoute !== "function") {
      const errorTimeoutId = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setRoutePlanning({
          key: routePlanningKey,
          message: "地图接口未暴露高德路线规划能力",
          result: null,
          status: "error",
        });
      }, 0);

      return () => {
        cancelled = true;
        window.clearTimeout(errorTimeoutId);
      };
    }

    const requestTimeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setRoutePlanning({
        key: routePlanningKey,
        message: "正在使用高德地图规划路线",
        result: null,
        status: "loading",
      });
      setSelectedRoutePlanId(null);

      planRoute({
        city: city.trim() || "上海",
        mode: transportMode,
        points: routeSourcePoints,
      })
        .then((result) => {
          if (cancelled) {
            return;
          }

          const nextSelectedRoutePlanId = result.plans[0]?.id ?? null;

          setRoutePlanning({
            key: routePlanningKey,
            message: result.message,
            result,
            status: result.plans.length > 0 ? "ready" : "error",
          });

          if (activePointRouteId && pointRoute && result.plans.length > 0) {
            setPlannedPointRoutes((currentRoutes) => ({
              ...currentRoutes,
              [activePointRouteId]: {
                id: activePointRouteId,
                mode: transportMode,
                planningKey: routePlanningKey,
                planId: nextSelectedRoutePlanId,
                pointRoute,
                result,
                updatedAt: Date.now(),
              },
            }));
            setSelectedRoutePlanId(nextSelectedRoutePlanId);
          }
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setRoutePlanning({
            key: routePlanningKey,
            message: getRoutePlanningErrorMessage(error),
            result: null,
            status: "error",
          });
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(requestTimeoutId);
    };
  }, [
    city,
    activePointRouteId,
    hasCachedRoutePlanForCurrentRoute,
    mapReadyVersion,
    pointRoute,
    routePlanningKey,
    routeSourcePoints,
    transportMode,
  ]);

  const updateSelectedMarker = (updates: Partial<Marker>) => {
    if (!selectedMarker) {
      return;
    }

    setMarkers((currentMarkers) =>
      currentMarkers.map((marker) =>
        marker.id === selectedMarker.id ? { ...marker, ...updates } : marker,
      ),
    );
  };

  const handleAddMarker = () => {
    const nextIndex = markers.length + 1;
    const viewportCenter = getCurrentMapViewport()?.center;
    const markerCenter =
      selectedMarker?.lngLat ?? userLocation?.lngLat ?? viewportCenter ?? defaultMapCenter;
    const nextMarker: Marker = {
      id: `marker-${Date.now()}`,
      name: `新点位 ${nextIndex}`,
      address: "拖动标记调整位置",
      color: "#7c3aed",
      kind: "circle-number",
      lngLat: selectedMarker
        ? [markerCenter[0] + 0.008, markerCenter[1] - 0.006]
        : [...markerCenter],
      locked: false,
    };

    setMarkers((currentMarkers) => [...currentMarkers, nextMarker]);
    setSelectedMarkerId(nextMarker.id);
    setLocationRouteTargetId(null);
    setPointRoute(null);
    setRouteConnectionSourceId(null);
    setSelectedRoutePlanId(null);
    setIsRouteSelected(false);
    openPanelMode("marker");
  };

  const handleMarkerMove = useCallback(
    (id: string, lngLat: [number, number]) => {
      setMarkers((currentMarkers) =>
        currentMarkers.map((currentMarker) =>
          currentMarker.id === id
            ? {
                ...currentMarker,
                address: `拖动定位 ${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(
                  5,
                )}`,
                lngLat,
              }
            : currentMarker,
        ),
      );
      setSelectedMarkerId(id);
      setIsRouteSelected(false);
      setPointRoute(null);
      setLocationRouteTargetId(null);
      setSelectedRoutePlanId(null);
      if (!routeConnectionSourceId) {
        openPanelMode("marker");
      }
    },
    [openPanelMode, routeConnectionSourceId],
  );

  const connectPointRouteMarkers = useCallback(
    (sourceMarkerId: string, targetMarkerId: string) => {
      const sourceMarker =
        markers.find((marker) => marker.id === sourceMarkerId) ?? null;
      const targetMarker =
        markers.find((marker) => marker.id === targetMarkerId) ?? null;

      if (!sourceMarker || !targetMarker || sourceMarker.id === targetMarker.id) {
        return false;
      }

      const existingRoute = findPointRouteConnection(
        routeConnections,
        sourceMarker.id,
        targetMarker.id,
      );
      const nextRoute =
        existingRoute ?? createPointRoute(sourceMarker.id, targetMarker.id);
      const plannedRoute = plannedPointRoutes[nextRoute.id] ?? null;

      if (!existingRoute) {
        setRouteConnections((currentRoutes) =>
          findPointRouteConnection(currentRoutes, sourceMarker.id, targetMarker.id)
            ? currentRoutes
            : [...currentRoutes, nextRoute],
        );
      }

      setSelectedMarkerId(targetMarker.id);
      setPointRoute(nextRoute);
      setLocationRouteTargetId(null);
      setRouteConnectionSourceId(null);
      setSelectedRoutePlanId(
        plannedRoute?.planId ?? plannedRoute?.result.plans[0]?.id ?? null,
      );
      if (plannedRoute) {
        setTransportMode(plannedRoute.mode);
      }
      setIsRouteSelected(false);
      openPanelMode("route");

      return true;
    },
    [markers, openPanelMode, plannedPointRoutes, routeConnections],
  );

  const handleSelectMarker = useCallback(
    (id: string) => {
      setSelectedMarkerId(id);

      if (routeConnectionSourceId) {
        if (!markers.some((marker) => marker.id === routeConnectionSourceId)) {
          setRouteConnectionSourceId(null);
          openPanelMode("marker");
          return;
        }

        if (
          id === routeConnectionSourceId ||
          connectPointRouteMarkers(routeConnectionSourceId, id)
        ) {
          return;
        }

        setRouteConnectionSourceId(null);
        openPanelMode("marker");
        return;
      }

      if (isLocated) {
        const marker = markers.find((currentMarker) => currentMarker.id === id);

        if (!userLocation || !marker) {
          setLocationStatus("locating");
          setLocationMessage("正在获取当前位置，定位成功后再次点击点位生成路线");
          openPanelMode("marker");
          return;
        }

        setPointRoute(null);
        setLocationRouteTargetId(id);
        setSelectedRoutePlanId(null);
        setIsRouteSelected(false);
        setLocationStatus("active");
        setLocationMessage(`已生成到 ${marker.name} 的路线`);
        openPanelMode("route");
        return;
      }

      setIsRouteSelected(false);
      setSelectedRoutePlanId(null);
      setPointRoute(null);
      setLocationRouteTargetId(null);
      openPanelMode("marker");
    },
    [
      connectPointRouteMarkers,
      isLocated,
      markers,
      openPanelMode,
      routeConnectionSourceId,
      userLocation,
    ],
  );

  const handleSelectMarkerFromRouteDetail = useCallback(
    (id: string) => {
      setSelectedMarkerId(id);
      setPointRoute(null);
      setLocationRouteTargetId(null);
      setRouteConnectionSourceId(null);
      setSelectedRoutePlanId(null);
      setIsRouteSelected(false);
      openPanelMode("marker");
    },
    [openPanelMode],
  );

  const handleRouteClick = useCallback((routeId?: string) => {
    if (routeConnectionSourceId) {
      return;
    }

    if (routeId?.startsWith("location:")) {
      const targetMarkerId = routeId.slice("location:".length);
      const targetMarker =
        markers.find((marker) => marker.id === targetMarkerId) ?? null;

      if (targetMarker) {
        setSelectedMarkerId(targetMarker.id);
        setPointRoute(null);
        setLocationRouteTargetId(targetMarker.id);
        setRouteConnectionSourceId(null);
        setSelectedRoutePlanId(routePlanForCurrentRoute?.plans[0]?.id ?? null);
        setIsRouteSelected(true);
        setRouteFocusVersion((currentVersion) => currentVersion + 1);
      }

      openPanelMode("route");
      return;
    }

    const nextRoute = routeId
      ? routeConnections.find((route) => route.id === routeId) ?? null
      : pointRoute ?? (routeConnections.length === 1 ? routeConnections[0] : null);

    if (nextRoute) {
      const plannedRoute = plannedPointRoutes[nextRoute.id] ?? null;

      setPointRoute(nextRoute);
      setLocationRouteTargetId(null);
      setRouteConnectionSourceId(null);
      setSelectedMarkerId(nextRoute.toMarkerId);
      setSelectedRoutePlanId(
        plannedRoute?.planId ?? plannedRoute?.result.plans[0]?.id ?? null,
      );
      setIsRouteSelected(true);
      setRouteFocusVersion((currentVersion) => currentVersion + 1);

      if (plannedRoute) {
        setTransportMode(plannedRoute.mode);
      }
    }

    openPanelMode("route");
  }, [
    markers,
    openPanelMode,
    plannedPointRoutes,
    pointRoute,
    routeConnectionSourceId,
    routeConnections,
    routePlanForCurrentRoute,
  ]);

  const handleSelectPointRoute = useCallback(
    (routeId: string) => {
      const nextRoute =
        routeConnections.find((route) => route.id === routeId) ?? null;

      if (!nextRoute) {
        return;
      }

      const plannedRoute = plannedPointRoutes[nextRoute.id] ?? null;

      setPointRoute(nextRoute);
      setLocationRouteTargetId(null);
      setRouteConnectionSourceId(null);
      setSelectedMarkerId(nextRoute.toMarkerId);
      setIsRouteSelected(true);
      setSelectedRoutePlanId(
        plannedRoute?.planId ?? plannedRoute?.result.plans[0]?.id ?? null,
      );
      setRouteFocusVersion((currentVersion) => currentVersion + 1);

      if (plannedRoute) {
        setTransportMode(plannedRoute.mode);
      }

      openPanelMode("route");
    },
    [openPanelMode, plannedPointRoutes, routeConnections],
  );

  const handleStartRouteConnection = useCallback((sourceMarkerId: string) => {
    if (!markers.some((marker) => marker.id === sourceMarkerId)) {
      return;
    }

    setSelectedMarkerId(sourceMarkerId);
    setRouteConnectionSourceId(sourceMarkerId);
    setPointRoute(null);
    setLocationRouteTargetId(null);
    setSelectedRoutePlanId(null);
    setIsRouteSelected(false);
    setPanelMode("marker");
    setIsPanelCollapsed(false);
  }, [markers]);

  const handleCancelRouteConnection = useCallback(() => {
    setRouteConnectionSourceId(null);
  }, []);

  const handleCreateRouteConnection = useCallback(
    (targetMarkerId: string) => {
      const sourceMarkerId = routeConnectionSourceId ?? selectedMarker?.id;

      if (!sourceMarkerId) {
        return;
      }

      connectPointRouteMarkers(sourceMarkerId, targetMarkerId);
    },
    [connectPointRouteMarkers, routeConnectionSourceId, selectedMarker],
  );

  const handleSelectRoutePlan = useCallback((planId: string) => {
    setSelectedRoutePlanId(planId);
    setIsRouteSelected(true);

    if (!activePointRouteId || !pointRoute || !routePlanForCurrentRoute) {
      return;
    }

    setPlannedPointRoutes((currentRoutes) => {
      const currentRoute = currentRoutes[activePointRouteId];

      if (!currentRoute) {
        return currentRoutes;
      }

      return {
        ...currentRoutes,
        [activePointRouteId]: {
          ...currentRoute,
          mode: transportMode,
          planningKey: routePlanningKey,
          planId,
          pointRoute,
          result: routePlanForCurrentRoute,
          updatedAt: Date.now(),
        },
      };
    });
  }, [
    activePointRouteId,
    pointRoute,
    routePlanForCurrentRoute,
    routePlanningKey,
    transportMode,
  ]);

  const handleRouteColorChange = useCallback(
    (color: string) => {
      if (!activePointRouteId) {
        return;
      }

      const nextColor = color.trim();

      setRouteStyles((currentStyles) => {
        if (!nextColor) {
          if (!currentStyles[activePointRouteId]) {
            return currentStyles;
          }

          const nextStyles = { ...currentStyles };
          delete nextStyles[activePointRouteId];
          return nextStyles;
        }

        if (currentStyles[activePointRouteId]?.color === nextColor) {
          return currentStyles;
        }

        return {
          ...currentStyles,
          [activePointRouteId]: {
            color: nextColor,
          },
        };
      });
    },
    [activePointRouteId],
  );

  const handleDeleteRoute = useCallback(() => {
    const deletedPointRoute = pointRoute;
    const deletedLocationTargetId = locationRouteTargetId;
    const nextSelectedMarkerId =
      deletedPointRoute?.fromMarkerId ??
      deletedLocationTargetId ??
      selectedMarker?.id ?? "";

    if (deletedPointRoute) {
      setRouteConnections((currentRoutes) =>
        currentRoutes.filter(
          (route) => !isPointRouteConnectionMatch(route, deletedPointRoute),
        ),
      );
      setPlannedPointRoutes((currentRoutes) => {
        const nextRoutes = { ...currentRoutes };
        delete nextRoutes[deletedPointRoute.id];
        return nextRoutes;
      });
      setRouteStyles((currentStyles) => {
        if (!currentStyles[deletedPointRoute.id]) {
          return currentStyles;
        }

        const nextStyles = { ...currentStyles };
        delete nextStyles[deletedPointRoute.id];
        return nextStyles;
      });
    }

    setSelectedMarkerId(nextSelectedMarkerId);
    setPointRoute(null);
    setLocationRouteTargetId(null);
    setRouteConnectionSourceId(null);
    setSelectedRoutePlanId(null);
    setIsRouteSelected(false);
    setRoutePlanning({
      key: "",
      message: "等待地图加载完成",
      result: null,
      status: "idle",
    });

    if (deletedLocationTargetId) {
      if (isLocated && userLocation) {
        setLocationStatus("active");
        setLocationMessage(
          userLocation.accuracy
            ? `定位已开启，精度约 ${Math.round(userLocation.accuracy)} 米`
            : "定位已开启",
        );
      } else if (isLocated) {
        setLocationStatus("locating");
        setLocationMessage("正在获取当前位置");
      } else {
        setLocationStatus("idle");
        setLocationMessage("定位未开启");
      }
    }

    openPanelMode("route");
  }, [
    isLocated,
    locationRouteTargetId,
    openPanelMode,
    pointRoute,
    selectedMarker,
    userLocation,
  ]);

  return (
    <main className="relative h-screen min-h-[720px] overflow-hidden bg-background text-foreground">
      <MapLayer
        focusedRouteId={focusedRouteId}
        markers={markers}
        onViewportChange={handleMapViewportChange}
        onReadyChange={handleMapReadyChange}
        onMarkerMove={handleMarkerMove}
        onRouteClick={handleRouteClick}
        onSelectMarker={handleSelectMarker}
        routes={mapRoutes}
        routeFitKey={routeFitKey}
        selectedMarkerId={selectedMarker?.id ?? ""}
        userLocation={userLocation?.lngLat ?? null}
        userLocationAccuracy={userLocation?.accuracy}
        viewportPadding={mapViewportPadding}
      />

      <WhiteboardLayer
        activeBrush={activeWhiteboardBrush}
        activeColor={activeWhiteboardColor}
        activeTool={activeWhiteboardTool}
        elements={whiteboardElements}
        onColorChange={setActiveWhiteboardColor}
        onElementsChange={setWhiteboardElements}
        watermark={whiteboardWatermark}
        viewportVersion={whiteboardViewportVersion}
      />

      <FloatingActions
        isLocated={isLocated}
        locationMessage={resolvedLocationMessage}
        locationStatus={locationStatus}
        onExport={handleOpenExportPanel}
        onImport={handleOpenImportPanel}
        onLocate={handleToggleLocation}
      />

      <WhiteboardToolbar
        activeBrush={activeWhiteboardBrush}
        activeColor={activeWhiteboardColor}
        activeTool={activeWhiteboardTool}
        onBrushChange={setActiveWhiteboardBrush}
        onColorChange={setActiveWhiteboardColor}
        onToolChange={setActiveWhiteboardTool}
      />

      <EditorPanel
        activePointRouteId={activePointRouteId}
        importExportView={importExportView}
        isCollapsed={isPanelCollapsed}
        locationRouteTarget={locationRouteTarget}
        mapExportTemplate={mapExportTemplate}
        mapShareCode={mapShareCode}
        marker={selectedMarker}
        markerNumber={selectedMarkerNumber}
        markerNumberById={markerNumberById}
        mode={panelMode}
        onAddMarker={handleAddMarker}
        onCollapseChange={setIsPanelCollapsed}
        onCancelRouteConnection={handleCancelRouteConnection}
        onCreateRouteConnection={handleCreateRouteConnection}
        onDeleteRoute={handleDeleteRoute}
        onDownloadMapTemplate={handleDownloadMapTemplate}
        onImportExportViewChange={setImportExportView}
        onImportMapTemplate={handleImportMapTemplate}
        onSelectMarker={handleSelectMarkerFromRouteDetail}
        onSelectPointRoute={handleSelectPointRoute}
        onSelectRoutePlan={handleSelectRoutePlan}
        onRouteColorChange={handleRouteColorChange}
        onStartRouteConnection={handleStartRouteConnection}
        onTransportModeChange={setTransportMode}
        onUpdateMarker={updateSelectedMarker}
        onWhiteboardWatermarkChange={handleWhiteboardWatermarkChange}
        pointRoute={pointRouteEndpoints}
        routePlan={routePlanForCurrentRoute}
        routePlanningMessage={routePlanningMessageForCurrentRoute}
        routePlanningStatus={routePlanningStatusForCurrentRoute}
        routeConnectionCandidates={routeConnectionCandidates}
        routeConnections={routeConnectionSummaries}
        routeConnectionSourceId={routeConnectionSourceId}
        routeColor={activeRouteStyle?.color ?? null}
        selectedRoutePlanId={resolvedSelectedRoutePlanId}
        transportMode={transportMode}
        userLocation={userLocation}
        whiteboardElementCount={whiteboardElements.length}
        whiteboardWatermark={whiteboardWatermark}
      />
    </main>
  );
}
