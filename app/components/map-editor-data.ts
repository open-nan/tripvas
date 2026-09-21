import type { LucideIcon } from "lucide-react";
import {
  Bike,
  Car,
  Eraser,
  FileJson,
  Footprints,
  Highlighter,
  ImagePlus,
  Layers,
  MapPin,
  MousePointer2,
  Move,
  PaintBucket,
  PencilLine,
  PenLine,
  Pipette,
  Route,
  TrainFront,
  Type as TypeIcon,
} from "lucide-react";

import type {
  MapViewportPadding,
  Marker,
  MarkerKind,
  PanelMode,
  TransportMode,
  WhiteboardBrush,
  WhiteboardTool,
} from "./map-editor-types";

export const initialMarkers: Marker[] = [];

/** 浏览器定位不可用时使用天安门作为地图默认中心。 */
export const defaultMapCenter: NanMapLngLat = [116.397389, 39.908722];

export const panelModes: Array<{ id: PanelMode; label: string; icon: LucideIcon }> = [
  { id: "marker", label: "点位", icon: MapPin },
  { id: "route", label: "路线", icon: Route },
  { id: "layers", label: "图层", icon: Layers },
  { id: "import-export", label: "导入导出", icon: FileJson },
];

export const whiteboardTools: Array<{
  id: WhiteboardTool;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "select", label: "选择", icon: MousePointer2 },
  { id: "move", label: "拖动画布", icon: Move },
  { id: "pen", label: "画笔", icon: PenLine },
  { id: "text", label: "文字", icon: TypeIcon },
  { id: "image", label: "图片", icon: ImagePlus },
  { id: "eyedropper", label: "吸色", icon: Pipette },
  { id: "bucket", label: "填充", icon: PaintBucket },
  { id: "erase", label: "擦除", icon: Eraser },
];

export const defaultWhiteboardColor = "#0f766e";

export const whiteboardColors = [
  "#111815",
  "#ffffff",
  "#64748b",
  "#0f766e",
  "#10b981",
  "#0284c7",
  "#2563eb",
  "#7c3aed",
  "#be123c",
  "#dc2626",
  "#d97706",
  "#facc15",
];

export const whiteboardBrushes: Array<{
  id: WhiteboardBrush;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "fountain", label: "钢笔", icon: PenLine },
  { id: "pencil", label: "铅笔", icon: PencilLine },
  { id: "crayon", label: "蜡笔", icon: Highlighter },
];

export const transportTabs: Array<{
  id: TransportMode;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "drive", label: "驾车", icon: Car },
  { id: "transit", label: "公交", icon: TrainFront },
  { id: "ride", label: "骑行", icon: Bike },
  { id: "walk", label: "步行", icon: Footprints },
];

export const routePlanTitles: Record<TransportMode, string> = {
  drive: "驾车备选线路",
  transit: "公交组合方案",
  ride: "骑行方案",
  walk: "步行路线",
};

export const markerStyleOptions: Array<{ id: MarkerKind; label: string }> = [
  { id: "star", label: "五角星" },
  { id: "circle", label: "圆底" },
  { id: "circle-star", label: "圆底星" },
  { id: "circle-number", label: "镂空数字" },
];

export const kindLabels: Record<MarkerKind, string> = {
  star: "五角星",
  circle: "圆底",
  "circle-star": "圆底星",
  "circle-number": "镂空数字",
};

export const panelTitles: Record<PanelMode, string> = {
  marker: "点位编辑",
  route: "路线规划",
  layers: "地图图层",
  "import-export": "导入导出",
};

export const geolocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 12_000,
};

export const defaultMapViewportPadding: MapViewportPadding = [96, 128, 96, 512];
