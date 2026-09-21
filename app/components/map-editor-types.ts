import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type MapLayerMarker = NanMapLayerMarker;
export type MapPlaceSearchResult = NanMapPlaceSearchResult;
export type MapRoutePlanMode = NanMapRoutePlanMode;
export type MapRoutePlanOption = NanMapRoutePlanOption;
export type MapRoutePlanResult = NanMapRoutePlanResult;
export type MapRouteOverlay = NanMapRouteOverlay;
export type MarkerKind = MapLayerMarker["kind"];
export type PanelMode = "marker" | "route" | "layers" | "import-export";
export type TransportMode = MapRoutePlanMode;
export type WhiteboardTool =
  | "select"
  | "move"
  | "pen"
  | "text"
  | "image"
  | "eyedropper"
  | "bucket"
  | "erase";
export type WhiteboardBrush = "fountain" | "pencil" | "crayon";
export type WhiteboardElementKind = "line" | "text" | "image";
export type WhiteboardTextFontWeight = 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type LocationStatus = "active" | "error" | "idle" | "locating";
export type MapViewportPadding = NanMapViewportPadding;
export type PlaceSearchStatus = "error" | "idle" | "loading" | "ready";
export type RoutePlanningStatus = "error" | "idle" | "loading" | "ready";
export type ImportExportPanelView = "export" | "import";

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
 * 白板自由绘制线条。
 *
 * points 保存为高德经纬度路径，而不是屏幕像素；地图平移或缩放时，
 * 白板层会重新把这些经纬度投影到 Konva 画布坐标。
 */
export type WhiteboardLineElement = {
  /** 线条对象的稳定 id，用于选中、拖动、删除和 React key。 */
  id: string;
  /** 白板对象类型。 */
  kind: "line";
  /** 线条创建时使用的笔触类型。 */
  brush: WhiteboardBrush;
  /** 用户绘制时经过的地图经纬度点集合。 */
  points: NanMapLngLat[];
  /** 线条颜色。 */
  color: string;
  /** 线条在屏幕上的视觉粗细，单位像素。 */
  strokeWidth: number;
  /** 线条透明度，取值范围 0 到 1。 */
  opacity: number;
};

/**
 * 白板文字对象。
 *
 * anchor 是文字左上角绑定的地图经纬度；fontSize 和 width 保持像素语义，
 * 因此地图缩放时文字位置会跟随地图，视觉尺寸不会被地图缩放放大或缩小。
 */
export type WhiteboardTextElement = {
  /** 文字对象的稳定 id，用于选中、拖动、编辑和 React key。 */
  id: string;
  /** 白板对象类型。 */
  kind: "text";
  /** 文字左上角绑定的地图经纬度坐标。 */
  anchor: NanMapLngLat;
  /** 展示文字内容。 */
  text: string;
  /** 文字颜色。 */
  color: string;
  /** 文字字体族，直接传给 Konva Text 和原地编辑输入框。 */
  fontFamily: string;
  /** 文字字重，用于控制普通、半粗、粗体等粗细效果。 */
  fontWeight: WhiteboardTextFontWeight;
  /** 文字字号，单位像素。 */
  fontSize: number;
  /** 文字换行宽度，单位像素。 */
  width: number;
};

/**
 * 白板图片对象。
 *
 * 当前版本把用户选择的图片保存为 data URL，并以 anchor 绑定地图位置；
 * width 和 height 使用屏幕像素，让图片在地图缩放时保持稳定的视觉大小。
 */
export type WhiteboardImageElement = {
  /** 图片对象的稳定 id，用于选中、拖动、缩放、删除和 React key。 */
  id: string;
  /** 白板对象类型。 */
  kind: "image";
  /** 图片左上角绑定的地图经纬度坐标。 */
  anchor: NanMapLngLat;
  /** 图片 data URL。 */
  src: string;
  /** 图片显示宽度，单位像素。 */
  width: number;
  /** 图片显示高度，单位像素。 */
  height: number;
  /** 图片透明度，取值范围 0 到 1。 */
  opacity: number;
};

/**
 * 白板层内可渲染和编辑的全部对象。
 */
export type WhiteboardElement =
  | WhiteboardImageElement
  | WhiteboardLineElement
  | WhiteboardTextElement;

/**
 * 白板水印设置。
 *
 * 水印是屏幕覆盖层，不绑定具体地图经纬度；地图拖动时水印保持屏幕平铺，
 * 白板对象则继续按各自的经纬度锚点投影。
 */
export type WhiteboardWatermarkConfig = {
  /** 是否显示水印。 */
  enabled: boolean;
  /** 水印文字内容。 */
  text: string;
  /** 水印透明度，取值范围 0 到 1。 */
  opacity: number;
  /** 水印字号，单位像素。 */
  size: number;
  /** 是否把水印平铺到整个白板层。 */
  tiled: boolean;
  /** 平铺水印之间的水平间距，单位像素。 */
  spacing: number;
};

/**
 * 导出模板里的地图视野快照。
 *
 * 它只保存中心点和缩放级别，导入后交给 public/map.js 恢复真实高德地图视野。
 */
export type MapExportViewport = {
  /** 导出时地图中心点。 */
  center: NanMapLngLat;
  /** 导出时地图缩放级别。 */
  zoom: number;
};

/**
 * 导出模板里的白板状态。
 *
 * 除了已经绘制的白板对象，也保存当前工具栏的颜色和笔触，让 P2P 导入后能继续编辑。
 */
export type MapExportWhiteboardState = {
  /** 导出时选中的白板笔触。 */
  activeBrush: WhiteboardBrush;
  /** 导出时白板工具栏的当前颜色。 */
  activeColor: string;
  /** 导出时激活的白板工具。 */
  activeTool: WhiteboardTool;
  /** 地图上方全部白板对象。 */
  elements: WhiteboardElement[];
  /** 白板水印配置。 */
  watermark: WhiteboardWatermarkConfig;
};

/**
 * Nan Map 的可分享地图模板。
 *
 * 模板覆盖地图点位、点到点线路、已规划路线缓存、路线样式、白板对象和地图视野。
 * 它是当前前端 P2P 分享的核心数据结构，不依赖账号或后端存储。
 */
export type MapExportTemplate = {
  /** 模板来源标识，用于导入时避免误读其他 JSON。 */
  app: "nan-map";
  /** 模板导出时间，ISO 字符串。 */
  exportedAt: string;
  /** 当前编辑器所在城市，用于后续搜索和公交路线规划。 */
  city: string;
  /** 导出时正在编辑的点到点线路 id。 */
  activePointRouteId: string | null;
  /** 地图点位列表。 */
  markers: Marker[];
  /** 已经创建的点到点线路连接。 */
  routeConnections: PointRoute[];
  /** 已成功规划并保留在地图上的路线缓存。 */
  plannedPointRoutes: Record<string, PlannedPointRoute>;
  /** 用户设置过的线路自定义颜色。 */
  routeStyles: Record<string, RouteStyle>;
  /** 导出时选中的点位 id。 */
  selectedMarkerId: string | null;
  /** 导出时选中的路线备选方案 id。 */
  selectedRoutePlanId: string | null;
  /** 导出时选中的交通方式。 */
  transportMode: TransportMode;
  /** 模板结构版本。 */
  version: 1;
  /** 导出时的地图中心和缩放；拿不到真实地图实例时为空。 */
  viewport: MapExportViewport | null;
  /** 白板层状态。 */
  whiteboard: MapExportWhiteboardState;
};

/**
 * 导入模板后的操作反馈。
 */
export type MapTemplateImportResult = {
  /** 导入是否成功。 */
  ok: boolean;
  /** 展示给用户的导入结果说明。 */
  message: string;
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
