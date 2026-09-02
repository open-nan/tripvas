import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type MapLayerMarker = NanMapLayerMarker;
export type MapPlaceSearchResult = NanMapPlaceSearchResult;
export type MapRoutePlanMode = NanMapRoutePlanMode;
export type MapRoutePlanOption = NanMapRoutePlanOption;
export type MapRoutePlanResult = NanMapRoutePlanResult;
export type MapRouteOverlay = NanMapRouteOverlay;
export type MarkerKind = MapLayerMarker["kind"];
export type PanelMode = "marker" | "route" | "layers";
export type TransportMode = MapRoutePlanMode;
export type WhiteboardTool = "select" | "move" | "pen" | "text" | "image" | "erase";
export type LocationStatus = "active" | "error" | "idle" | "locating";
export type MapViewportPadding = NanMapViewportPadding;
export type PlaceSearchStatus = "error" | "idle" | "loading" | "ready";
export type RoutePlanningStatus = "error" | "idle" | "loading" | "ready";

export type Marker = MapLayerMarker & {
  address: string;
  color: string;
  locked: boolean;
};

export type PlaceSuggestion = MapPlaceSearchResult;

export type UserLocation = {
  accuracy?: number;
  lngLat: NanMapLngLat;
  updatedAt: number;
};

/**
 * 线路样式配置。
 *
 * 只保存用户主动调整的展示属性，不和高德返回的路线规划结果混在一起。
 */
export type RouteStyle = {
  /** 用户为线路选择的自定义颜色；为空时地图层按交通方式使用默认颜色。 */
  color: string;
};

/**
 * 点到点线路连接记录。
 *
 * 它只描述业务层已经建立过哪两个点位的连接；真正的线路候选方案和地图绘制
 * 仍由高德路线规划接口根据端点实时生成。
 */
export type PointRoute = {
  /** 点到点线路连接的稳定 id，用于地图覆盖物点击后回到对应业务路线。 */
  id: string;
  /** 连接创建时间戳，用于后续排序或历史记录扩展。 */
  createdAt: number;
  /** 连接起点的点位 id。 */
  fromMarkerId: string;
  /** 连接终点的点位 id。 */
  toMarkerId: string;
};

/**
 * 已经成功规划并保留在地图上的点到点线路。
 *
 * 它缓存某条连接在某个交通方式下的高德规划结果。用户后续创建其他线路时，
 * 这些缓存会继续绘制在地图上；只有当前正在编辑的线路重新规划成功后，才会更新
 * 对应缓存。
 */
export type PlannedPointRoute = {
  /** 与 PointRoute.id 一致，用于快速索引和地图点击匹配。 */
  id: string;
  /** 该规划结果对应的点到点连接记录。 */
  pointRoute: PointRoute;
  /** 当前缓存结果对应的规划请求 key，用于判断是否需要重新调用高德。 */
  planningKey: string;
  /** 当前保存的候选方案 id；为空时使用高德返回的第一条方案。 */
  planId: string | null;
  /** 当前缓存结果对应的交通方式。 */
  mode: TransportMode;
  /** 高德返回并归一化后的路线规划结果。 */
  result: MapRoutePlanResult;
  /** 最近更新时间戳，用于触发地图视野或排序扩展。 */
  updatedAt: number;
};

/**
 * 线路弹框里用于选择已保存线路的摘要数据。
 *
 * 它把 PointRoute 的起终点 id 解析成可展示的 Marker，并携带当前已保存的交通方式、
 * 主方案距离和耗时。RouteDetail 只消费这个轻量结构，不直接关心顶层缓存字典。
 */
export type RouteConnectionSummary = {
  /** 线路连接 id，与 PointRoute.id 一致。 */
  id: string;
  /** 线路起点。 */
  from: Marker;
  /** 线路终点。 */
  to: Marker;
  /** 线路当前保存的交通方式；尚未规划成功时为空。 */
  mode: TransportMode | null;
  /** 用户为线路选择的自定义颜色；为空时使用交通方式默认颜色。 */
  color?: string;
  /** 当前保存主方案的总距离，单位米；未规划成功时为空。 */
  distance?: number;
  /** 当前保存主方案的总耗时，单位秒；未规划成功时为空。 */
  duration?: number;
  /** 当前保存主方案标题，例如“推荐路线”。 */
  planTitle?: string;
  /** 是否已经有高德规划结果。 */
  status: "pending" | "planned";
};

/**
 * 当前正在查看或规划的点到点路线端点。
 *
 * MapEditor 会把 PointRoute 中保存的 id 解析成完整 Marker，方便 RouteDetail
 * 直接渲染端点名称、地址和坐标。
 */
export type PointRouteEndpoints = {
  /** 路线起点点位。 */
  from: Marker;
  /** 路线终点点位。 */
  to: Marker;
};

export type RoutePlanMetric = {
  icon: LucideIcon;
  label: string;
  value: string;
};

export type RoutePlanningState = {
  key: string;
  message: string;
  result: MapRoutePlanResult | null;
  status: RoutePlanningStatus;
};

export type PlaceSearchState = {
  city: string;
  keyword: string;
  message: string;
  places: PlaceSuggestion[];
  status: PlaceSearchStatus;
};

export type ToolPanelActionSlotChange = (...slot: ReactNode[]) => void;
